import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
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
    apiMock.rejectOrderItem.mockResolvedValue(undefined);
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
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { kind: 'item', itemId: 3, name: 'Torta' });
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
});
