import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingRefund } from '../types/api';
import { PendingRefunds } from './pending-refunds';

const apiMock = vi.hoisted(() => ({ pendingRefunds: vi.fn(), confirmRefund: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const refund = (over: Partial<PendingRefund> = {}): PendingRefund => ({
  id: 'r1',
  origen: 'sobrante_cuenta',
  espacio_id: 7,
  pedido_id: null,
  metodo_original: 'efectivo',
  monto: '50.00',
  estado: 'pendiente',
  creado_en: '2026-10-02T20:00:00Z',
  metodo_devolucion: null,
  nota: null,
  devuelta_en: null,
  ...over,
});

describe('devoluciones pendientes', () => {
  beforeEach(() => {
    apiMock.pendingRefunds.mockReset();
    apiMock.confirmRefund.mockReset();
  });

  it('el sobrante de una cuenta se ve como tarea de Caja con monto y método, y se confirma', async () => {
    apiMock.pendingRefunds.mockResolvedValueOnce([refund()]).mockResolvedValue([]);
    apiMock.confirmRefund.mockResolvedValue(refund({ estado: 'devuelta', metodo_devolucion: 'efectivo' }));
    const user = userEvent.setup();
    render(<PendingRefunds token="t" spaceId={7} canConfirm />, { wrapper });

    expect(await screen.findByText('Devolver $50.00 MXN')).toBeInTheDocument();
    expect(screen.getByText(/se abonó de más a la cuenta · se pagó con efectivo/i)).toBeInTheDocument();
    expect(apiMock.pendingRefunds).toHaveBeenCalledWith('t', 7);

    await user.click(screen.getByRole('button', { name: 'Devuelto en efectivo' }));
    await waitFor(() => expect(apiMock.confirmRefund).toHaveBeenCalledWith('t', 'r1', 'efectivo'));
    expect(await screen.findByText('Devolución de $50.00 MXN confirmada.')).toBeInTheDocument();
  });

  it('lo pagado con terminal sugiere devolver en terminal; el mesero solo lo ve', async () => {
    apiMock.pendingRefunds.mockResolvedValue([refund({ origen: 'rechazo_articulo', metodo_original: 'efectivo+terminal', monto: '35.00' })]);
    render(<PendingRefunds token="t" canConfirm={false} />, { wrapper });

    expect(await screen.findByText('Devolver $35.00 MXN')).toBeInTheDocument();
    expect(screen.getByText(/se quitó un artículo ya pagado · se pagó con efectivo y terminal/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
