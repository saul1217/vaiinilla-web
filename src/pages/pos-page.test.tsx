import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
import { PosPage } from './pos-page';

const apiMock = vi.hoisted(() => ({
  activeCashSession: vi.fn(), operationalStatus: vi.fn(), listOrders: vi.fn(),
  collectCash: vi.fn(), deliverOrder: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'token', context: { establecimiento_id: 'store-1', rol: 'cajero' },
      access: { establecimiento: { nombre: 'USAGI' } },
    },
  }),
}));
vi.mock('../hooks/use-operational-heartbeat', () => ({
  isHeartbeatRole: () => false,
  useOperationalHeartbeat: () => ({ isSuccess: true, isError: false }),
}));
vi.mock('../lib/staff-ui', () => ({ useStaffUi: () => ['nueva', vi.fn()] }));
vi.mock('../components/operational-status-panel', () => ({ OperationalStatusPanel: () => null }));
vi.mock('../components/pending-refunds', () => ({ PendingRefunds: () => null }));
vi.mock('../components/waiter-board', () => ({ WaiterBoard: () => null }));
vi.mock('../components/staff-ui-switch', () => ({ StaffUiSwitch: () => null }));
vi.mock('../components/reject-order-dialog', () => ({ RejectOrderDialog: () => null }));

const baseOrder: OrderDetail = {
  id: 'order-14', folio: 14, fecha_operativa: '2026-10-07', estado: 'listo',
  metodo_pago: 'efectivo', destino: 'para_llevar', espacio: null,
  subtotal: '125.00', ahorro_combinado: '0.00', cashback_otorgado: '0.00', total: '125.00',
  monto_pagado: '0.00', saldo_pendiente: '125.00', pago_diferido: false,
  version: 4, creado_en: '2026-10-07T12:00:00.000Z', actualizado_en: '2026-10-07T12:20:00.000Z',
  notas_cocina: null, usuario: { nombre: 'Pepito', matricula: null }, items: [],
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('Caja: cobrar, imprimir y entregar pedido listo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.activeCashSession.mockResolvedValue({ id: 'cash-1', fecha_operativa: '2026-10-07', monto_inicial: '500.00', monto_final: null, abierta_en: '2026-10-07T10:00:00.000Z', cerrada_en: null, cierre_automatico: false });
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: false });
    apiMock.listOrders.mockResolvedValue({ orders: [baseOrder], cursor: null });
    apiMock.collectCash.mockResolvedValue({ cambio: '0.00' });
  });

  it('solo permite cobrar cuando está listo pero pendiente, y después ofrece imprimir y entregar', async () => {
    const user = userEvent.setup();
    const paidOrder = { ...baseOrder, monto_pagado: '125.00', saldo_pendiente: '0.00', version: 5 };
    apiMock.listOrders.mockResolvedValueOnce({ orders: [baseOrder], cursor: null })
      .mockResolvedValue({ orders: [paidOrder], cursor: null });

    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Cobrar $125.00 MXN' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /imprimir ticket|validar qr|entregar/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cobrar $125.00 MXN' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Efectivo recibido (MXN)');
    await user.type(amount, '125');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cobro' }));

    await waitFor(() => expect(apiMock.collectCash).toHaveBeenCalledWith('token', baseOrder.id, '125.00', 4, '0.00'));
    expect(await screen.findByRole('button', { name: 'Imprimir ticket' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entregar' })).toBeVisible();
    expect(screen.getByText('PAGADO')).toBeVisible();
  });

  it('exige QR después de cobrar solamente cuando la configuración lo requiere', async () => {
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, monto_pagado: '125.00', saldo_pendiente: '0.00' }], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Validar QR' })).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validar QR' }));
    expect(await screen.findByLabelText('Token QR de entrega')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeDisabled();
    expect(apiMock.deliverOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Entregar pedido 14');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Imprimir ticket' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Validar QR' })).toBeVisible();
  });

  it('un pedido ya pagado aparece al quedar listo y puede entregarse sin QR', async () => {
    const paidOrder = {
      ...baseOrder,
      destino: 'en_espacio',
      monto_pagado: '125.00',
      saldo_pendiente: '0.00',
    };
    apiMock.listOrders.mockResolvedValueOnce({ orders: [paidOrder], cursor: null })
      .mockResolvedValue({ orders: [], cursor: null });
    apiMock.deliverOrder.mockResolvedValue({ ...paidOrder, estado: 'entregado', version: 5 });

    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: 'Imprimir ticket' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entregar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /cobrar/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    expect(screen.queryByLabelText('Token QR de entrega')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Confirmar entrega' }));

    await waitFor(() => expect(apiMock.deliverOrder).toHaveBeenCalledWith('token', paidOrder.id, paidOrder.version, ''));
    expect(await screen.findByText('Sin entregas pendientes')).toBeVisible();
    expect(screen.queryByText('Pedido 14')).not.toBeInTheDocument();
  });
});
