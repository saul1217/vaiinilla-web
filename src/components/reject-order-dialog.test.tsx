import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
import { itemRejectionNotice } from '../lib/rejection-notice';
import { RejectOrderDialog } from './reject-order-dialog';

const apiMock = vi.hoisted(() => ({ rejectOrder: vi.fn(), rejectOrderItem: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const item = (id: number, nombre: string, estacion: 'cocina' | 'caja', extra = {}) => ({
  id, producto_id: id, nombre_producto: nombre, estacion_preparacion: estacion, cantidad: 1,
  precio_digital_unitario: '10.00', subtotal: '10.00', opciones: [], rechazo: null, ...extra,
});
const order = (items: ReturnType<typeof item>[]) => ({ id: 'p1', folio: 41, version: 3, items }) as unknown as OrderDetail;

describe('no se puede preparar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cocina quita un solo artículo de su estación con motivo', async () => {
    const onRejected = vi.fn();
    const result = { rechazo: { pedido_item_id: 3, motivo: 'Se terminó el pan', monto: '35.00', metodo_reembolso: 'manual' as const, stripe_refund_id: null }, devolucion: null };
    apiMock.rejectOrderItem.mockResolvedValue(result);
    const user = userEvent.setup();
    render(
      <RejectOrderDialog
        token="t"
        order={order([item(1, 'Tacos', 'cocina'), item(2, 'Refresco', 'caja'), item(3, 'Torta', 'cocina')])}
        allowWholeOrder
        itemFilter={(it) => it.estacion_preparacion === 'cocina'}
        onClose={vi.fn()}
        onRejected={onRejected}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('radio', { name: 'Todo el pedido' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Refresco/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Torta/ }));
    await user.type(screen.getByRole('textbox', { name: 'Motivo' }), 'Se terminó el pan');
    await user.click(screen.getByRole('button', { name: 'Quitar artículo' }));

    await waitFor(() => expect(apiMock.rejectOrderItem).toHaveBeenCalledWith('t', 'p1', 3, 3, 'Se terminó el pan'));
    expect(apiMock.rejectOrder).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { kind: 'item', itemId: 3, name: 'Torta' }, result);
  });

  it('el pedido completo sigue usando el rechazo de siempre', async () => {
    apiMock.rejectOrder.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <RejectOrderDialog token="t" order={order([item(1, 'Tacos', 'cocina'), item(2, 'Torta', 'cocina')])} allowWholeOrder onClose={vi.fn()} onRejected={vi.fn()} />,
      { wrapper: Wrapper },
    );
    await user.type(screen.getByRole('textbox', { name: 'Motivo' }), 'Se fue la luz');
    await user.click(screen.getByRole('button', { name: 'Rechazar pedido' }));
    await waitFor(() => expect(apiMock.rejectOrder).toHaveBeenCalledWith('t', 'p1', 3, 'Se fue la luz'));
  });

  it('no ofrece el último artículo activo ni los ya rechazados', () => {
    render(
      <RejectOrderDialog
        token="t"
        order={order([item(1, 'Tacos', 'cocina'), item(2, 'Torta', 'cocina', { rechazo: { motivo: 'x', monto: '10.00' } })])}
        allowWholeOrder={false}
        onClose={vi.fn()}
        onRejected={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/solo tiene un artículo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar pedido' })).toBeDisabled();
  });

  // Auditoría ítem 5: la devolución manual no se pierde en "Se quitó…".
  it('el aviso dice qué hacer con el dinero según cómo se pagó', () => {
    const o = { folio: 12 } as OrderDetail;
    const r = (metodo: 'ninguno' | 'efectivo' | 'stripe' | 'manual', original?: string) => ({
      rechazo: { pedido_item_id: 3, motivo: 'x', monto: '35.00', metodo_reembolso: metodo, stripe_refund_id: null },
      devolucion: original
        ? { id: 'd1', origen: 'rechazo_articulo' as const, espacio_id: null, pedido_id: 'p1', metodo_original: original, monto: '35.00', estado: 'pendiente' as const, creado_en: '', metodo_devolucion: null, nota: null, devuelta_en: null }
        : null,
    });
    expect(itemRejectionNotice(o, 'Torta', r('manual', 'efectivo+terminal'))).toBe(
      'Se quitó Torta del pedido 12. El cliente verá el motivo. Devolución pendiente: $35.00 MXN (se pagó con efectivo y terminal). Caja debe entregarla y confirmarla.',
    );
    expect(itemRejectionNotice(o, 'Torta', r('efectivo'))).toMatch(/Entrega \$35.00 MXN del cajón/);
    expect(itemRejectionNotice(o, 'Torta', r('stripe'))).toMatch(/reembolsan \$35.00 MXN a su tarjeta/);
    expect(itemRejectionNotice(o, 'Torta', r('ninguno'))).toBe('Se quitó Torta del pedido 12. El cliente verá el motivo.');
  });
});
