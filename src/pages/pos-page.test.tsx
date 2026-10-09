import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogResponse, OrderDetail } from '../types/api';
import { PosPage } from './pos-page';

const apiMock = vi.hoisted(() => ({
  activeCashSession: vi.fn(), operationalStatus: vi.fn(), listOrders: vi.fn(),
  collectCash: vi.fn(), deliverOrder: vi.fn(),
  catalog: vi.fn(), spaceAvailability: vi.fn(), createStaffOrder: vi.fn(),
}));

const sesion = vi.hoisted(() => ({ rol: 'cajero' }));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'token', context: { establecimiento_id: 'store-1', rol: sesion.rol },
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

const CATALOGO: CatalogResponse = {
  categorias: [{ id: 10, nombre: 'Bebidas', orden: 1 }],
  productos: [
    {
      id: 1,
      categoria_id: 10,
      estacion_preparacion: 'cocina',
      nombre: 'Chocolate caliente',
      descripcion: null,
      ingredientes: null,
      alergenos: null,
      tiempo_estimado_min: 5,
      precio_mostrador: '23.00',
      precio_digital: '23.00',
      disponible: true,
      imagen_url: null,
      grupos_opcion: [],
    },
  ],
};

const PEDIDO_CREADO = {
  id: 'pedido-7',
  folio: 7,
  estado: 'por_cobrar',
  version: 1,
} as OrderDetail;

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function enviarCobroAlInstante(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo pedido' });
  await user.click(await within(dialog).findByRole('button', { name: 'Agregar' }));
  await user.click(within(dialog).getByLabelText('Cobrar ahora en efectivo'));
  await user.type(within(dialog).getByLabelText(/Efectivo recibido/), '50');
  await user.click(within(dialog).getByRole('button', { name: 'Enviar y cobrar' }));
  await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
}

describe('Caja: cobrar, imprimir y entregar pedido listo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sesion.rol = 'cajero';
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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Validar QR' }));
    expect(await screen.findByLabelText('Token QR de entrega')).toBeVisible();
  });

  it('permite entregar sin QR un pedido de una sesión activa aunque el ajuste global lo requiera', async () => {
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [{
      ...baseOrder,
      destino: 'en_espacio',
      espacio: { id: 67, nombre: 'Mesa 67', tipo: 'mesa' },
      sesion_espacio_id: 'session-67',
      sesion_espacio_estado: 'abierta',
      pago_diferido: true,
      pago_pendiente: true,
    }], cursor: null });
    apiMock.deliverOrder.mockResolvedValue({ folio: 14 });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Entregar' }));
    expect(screen.queryByLabelText('Token QR de entrega')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(apiMock.deliverOrder).toHaveBeenCalledWith('token', 'order-14', 4, ''));
  });
});

describe('POS: Nuevo pedido del staff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sesion.rol = 'mesero';
    apiMock.activeCashSession.mockResolvedValue(null);
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [], cursor: null });
    apiMock.catalog.mockResolvedValue(CATALOGO);
    apiMock.spaceAvailability.mockResolvedValue([]);
    apiMock.createStaffOrder.mockResolvedValue(PEDIDO_CREADO);
  });

  it('el mesero abre el formulario de Nuevo pedido desde el POS', async () => {
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo pedido' });
    expect(within(dialog).getByRole('button', { name: 'Enviar pedido' })).toBeVisible();
  });

  it('al registrar el pedido cierra el formulario y avisa con su folio', async () => {
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo pedido' });
    await user.click(await within(dialog).findByRole('button', { name: 'Agregar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nuevo pedido' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/registrado\./)).toHaveTextContent('Pedido 7 registrado.');
  });

  it('al cobrar ahora, Caja ve el cambio que debe dar', async () => {
    sesion.rol = 'cajero';
    apiMock.createStaffOrder.mockResolvedValue({
      ...PEDIDO_CREADO,
      cobro: { estado: 'cobrado', monto_recibido: '50.00', cambio: '27.00' },
    });
    render(<PosPage />, { wrapper: Wrapper });

    await enviarCobroAlInstante(userEvent.setup());

    expect(await screen.findByText(/cobrado\./)).toHaveTextContent(
      'Pedido 7 cobrado. Cambio $27.00 MXN.',
    );
  });

  it('si Caja no puede cobrar al instante, el pedido queda registrado sin cobrar y lo dice', async () => {
    sesion.rol = 'cajero';
    apiMock.createStaffOrder.mockResolvedValue({
      ...PEDIDO_CREADO,
      cobro: {
        estado: 'pendiente',
        codigo: 'ESTABLISHMENT_NOT_RECEIVING',
        mensaje: 'La caja está cerrada.',
      },
    });
    render(<PosPage />, { wrapper: Wrapper });

    await enviarCobroAlInstante(userEvent.setup());

    expect(await screen.findByText(/sin cobrar/)).toHaveTextContent(
      'Pedido 7 registrado sin cobrar. La caja está cerrada.',
    );
  });
});
