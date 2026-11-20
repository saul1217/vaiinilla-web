import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogResponse, OrderDetail } from '../types/api';
import { PosPage } from './pos-page';

const mixedUnavailable = vi.hoisted(() => ({ value: false }));
const apiMock = vi.hoisted(() => ({
  activeCashSession: vi.fn(), operationalStatus: vi.fn(), listOrders: vi.fn(),
  payOrderMixed: vi.fn(),
  pendingMixedPayment: vi.fn(() => null),
  recoverPendingMixedPayments: vi.fn().mockResolvedValue([]),
  abonarSpaceAccount: vi.fn(), spaceSession: vi.fn(),
  isMixedPaymentUnavailable: vi.fn(() => mixedUnavailable.value),
  markMixedPaymentUnavailable: vi.fn(() => { mixedUnavailable.value = true; }),
  collectCash: vi.fn(), deliverOrder: vi.fn(), closeCashSession: vi.fn(),
  rejectOrder: vi.fn(), rejectOrderItem: vi.fn(), catalog: vi.fn(), spaceAvailability: vi.fn(), spaces: vi.fn().mockResolvedValue([]), createStaffOrder: vi.fn(),
  businessSettings: vi.fn(), transitionOrder: vi.fn(), remindOrder: vi.fn(), markNotPickedUp: vi.fn(),
}));

const sesion = vi.hoisted(() => ({ rol: 'cajero' }));

vi.mock('../lib/api', () => ({ api: apiMock, apiUrl: 'http://127.0.0.1:3000' }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'token', context: { establecimiento_id: 'store-1', usuario_id: 'user-1', rol: sesion.rol },
      access: { establecimiento: { nombre: 'USAGI' } },
    },
  }),
}));
vi.mock('../hooks/use-operational-heartbeat', () => ({
  isHeartbeatRole: () => false,
  useOperationalHeartbeat: () => ({ isSuccess: true, isError: false }),
}));
vi.mock('../components/operational-status-panel', () => ({ OperationalStatusPanel: () => <div>Estado operativo</div> }));
vi.mock('../components/pending-refunds', () => ({ PendingRefunds: () => null }));
vi.mock('../components/waiter-board', () => ({ WaiterBoard: () => null }));


const baseOrder: OrderDetail = {
  id: 'order-14', folio: 14, fecha_operativa: '2026-10-07', estado: 'listo',
  metodo_pago: 'efectivo', destino: 'para_llevar', espacio: null,
  subtotal: '125.00', ahorro_combinado: '0.00', cashback_otorgado: '0.00', total: '125.00',
  monto_pagado: '0.00', saldo_pendiente: '125.00', pago_diferido: false,
  version: 4, creado_en: '2026-10-07T12:00:00.000Z', actualizado_en: '2026-10-07T12:20:00.000Z',
  notas_cocina: null, usuario: { nombre: 'Pepito', matricula: null }, items: [],
};

const owner = { establecimientoId: 'store-1', usuarioId: 'user-1' };
const mesaOrder: OrderDetail = { ...baseOrder, destino: 'en_espacio', espacio: { id: 67, nombre: 'Mesa 67', tipo: 'mesa' }, sesion_espacio_id: 'sesion-1' };
function mesaSession() {
  const otro = { id: 'order-15', folio: 15, estado: 'listo' as const, total: 175, pago_diferido: false, pendiente_cobro: true, cliente: null, items_resumen: '', creado_en: '2026-10-07T12:30:00.000Z' };
  return {
    espacio: mesaOrder.espacio, estado: 'ocupado', saldada: false, fin_previsto: null,
    sesion: { id: 'sesion-1', estado: 'abierta', inicio: '2026-10-07T11:00:00.000Z', fin_previsto: null, version: 3 },
    cuenta: {
      pedidos: [{ ...otro, id: 'order-14', folio: 14, total: 125 }, otro],
      total: 300, pendiente: 300, pagado: 0, saldada: false, abonado: 0, restante: 300,
    },
  };
}

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
  return <MemoryRouter><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MemoryRouter>;
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
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mixedUnavailable.value = false;
    apiMock.recoverPendingMixedPayments.mockResolvedValue([]);
    sesion.rol = 'cajero';
    apiMock.activeCashSession.mockResolvedValue({ id: 'cash-1', fecha_operativa: '2026-10-07', monto_inicial: '500.00', monto_final: null, abierta_en: '2026-10-07T10:00:00.000Z', cerrada_en: null, cierre_automatico: false });
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: false });
    apiMock.listOrders.mockResolvedValue({ orders: [baseOrder], cursor: null });
    apiMock.collectCash.mockResolvedValue({ cambio: '0.00' });
    apiMock.payOrderMixed.mockResolvedValue({ pago: { metodo_pago: 'efectivo', monto: '50.00' }, restante: '75.00', liquidada: false, pedido: baseOrder });
    apiMock.abonarSpaceAccount.mockResolvedValue({ abono: { id: 'abono-1', metodo_pago: 'terminal', monto: '125.00', monto_recibido: null, cambio: '0.00' }, restante: '0.00', liquidada: true, pedidos_cobrados: 1 });
    apiMock.businessSettings.mockResolvedValue({ permite_pago_al_final: false, tipo: 'cafeteria', entrega_requiere_qr: true, gracia_liberacion_min: 5, franjas_pedido: [] });
  });

  it('permite rechazar desde Caja un pedido de un solo artículo con el diálogo real', async () => {
    const user = userEvent.setup();
    apiMock.rejectOrder.mockResolvedValue({});
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, estado: 'por_cobrar', items: [{
      id: 1, producto_id: 1, nombre_producto: 'Chocolate', estacion_preparacion: 'caja', cantidad: 1,
      precio_digital_unitario: '125.00', subtotal: '125.00', opciones: [], rechazo: null,
    }] }], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    // Quitar un artículo vive en el ticket completo, que se abre con «Ver pedido».
    await user.click(await screen.findByRole('button', { name: /^Ver pedido 14 de / }));
    await user.click(await screen.findByRole('button', { name: 'Quitar artículo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar pedido' });
    expect(within(dialog).getByRole('radio', { name: 'Todo el pedido' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Rechazar pedido' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motivo'), 'Producto agotado');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar pedido' }));
    await waitFor(() => expect(apiMock.rejectOrder).toHaveBeenCalledExactlyOnceWith('token', 'order-14', 4, 'Producto agotado'));
    expect(apiMock.rejectOrderItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['cajero', 'mesero', 'admin'])('respeta el tema claro elegido por %s al entrar y salir', (role) => {
    sesion.rol = role;
    const previousTheme = document.documentElement.dataset.adminTheme;
    const previousPreference = window.localStorage.getItem('vaiinilla.panel.admin-theme');
    document.documentElement.dataset.adminTheme = 'claro';
    window.localStorage.setItem('vaiinilla.panel.admin-theme', 'claro');
    const { unmount } = render(<PosPage />, { wrapper: Wrapper });
    try {
      expect(document.documentElement.dataset.adminTheme).toBe('claro');
      expect(window.localStorage.getItem('vaiinilla.panel.admin-theme')).toBe('claro');
      unmount();
      expect(document.documentElement.dataset.adminTheme).toBe('claro');
      expect(window.localStorage.getItem('vaiinilla.panel.admin-theme')).toBe('claro');
    } finally {
      unmount();
      if (previousTheme === undefined) delete document.documentElement.dataset.adminTheme;
      else document.documentElement.dataset.adminTheme = previousTheme;
      if (previousPreference === null) window.localStorage.removeItem('vaiinilla.panel.admin-theme');
      else window.localStorage.setItem('vaiinilla.panel.admin-theme', previousPreference);
    }
  });

  it.each(['cajero', 'mesero', 'admin'])('retira el selector y migra la preferencia de %s', (role) => {
    sesion.rol = role;
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    const { unmount } = render(<PosPage />, { wrapper: Wrapper });
    expect(screen.queryByRole('button', { name: /UI anterior|UI nueva/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
    unmount();
  });

  it('conserva los controles y datos de Administración en la UI nueva', async () => {
    sesion.rol = 'admin';
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Caja abierta')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sesión de Caja' })).toBeInTheDocument();
    expect(screen.getByLabelText('Datos de la sesión de Caja')).toHaveTextContent('2026-10-07');
    expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Cerrar caja'));
    expect(screen.getByRole('button', { name: 'Revisar cierre' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(screen.getByText('Estado del local').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Estado operativo')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Cobrar \$/ })).not.toBeInTheDocument();
  });

  it.each([true, false])('el mesero no ve la barra de Caja (sesión abierta: %s)', async (open) => {
    sesion.rol = 'mesero';
    if (!open) apiMock.activeCashSession.mockResolvedValue(null);
    render(<PosPage />, { wrapper: Wrapper });
    await waitFor(() => expect(apiMock.activeCashSession).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Sesión de Caja' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Caja abierta|Caja cerrada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir Caja' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cerrar caja')).not.toBeInTheDocument();
  });

  it.each(['cajero', 'admin'])('exige confirmar el cierre de Caja para %s', async (role) => {
    sesion.rol = role;
    apiMock.closeCashSession.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByText('Cerrar caja'));
    await user.type(screen.getByLabelText('Monto final (MXN)'), '750.50');
    expect(apiMock.closeCashSession).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Revisar cierre' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar la caja?' });
    expect(dialog).toHaveTextContent('$750.50 MXN');
    expect(within(dialog).getByLabelText('Resumen de cierre')).toHaveFocus();
    expect(apiMock.closeCashSession).not.toHaveBeenCalled();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText('Monto final (MXN)')).toHaveFocus());
    expect(screen.getByLabelText('Monto final (MXN)')).toHaveValue('750.50');
    expect(apiMock.closeCashSession).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Revisar cierre' }));
    const confirmation = await screen.findByRole('dialog', { name: '¿Cerrar la caja?' });
    expect(apiMock.closeCashSession).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() => expect(apiMock.closeCashSession).toHaveBeenCalledExactlyOnceWith('token', 'cash-1', '750.50'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ofrece apertura de Caja a Admin cuando no hay sesión', async () => {
    sesion.rol = 'admin';
    apiMock.activeCashSession.mockResolvedValue(null);
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Caja cerrada')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir Caja' }));
    expect(screen.getByLabelText('Monto inicial (MXN)')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Abrir Caja' })).toBeEnabled();
  });

  it('sin «La barra prepara» pide por_cobrar, preparando y listo, no cobrado, y muestra preparando sin pagar en Por cobrar', async () => {
    const preparing = {
      ...baseOrder,
      id: 'order-prep',
      folio: 15,
      estado: 'preparando' as const,
      monto_pagado: '0.00',
      saldo_pendiente: '125.00',
    };
    apiMock.listOrders.mockResolvedValue({ orders: [preparing], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(apiMock.listOrders).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ estado: ['por_cobrar', 'preparando', 'listo'] }),
      ),
    );
    expect(await screen.findByRole('button', { name: 'Cobrar $125.00 MXN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entregar' })).not.toBeInTheDocument();
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
    // La tarjeta ya ofrece entregar; imprimir queda en el ticket completo.
    expect(await screen.findByRole('button', { name: 'Entregar' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Ver pedido 14 de / }));
    const ticket = await screen.findByRole('dialog', { name: 'Pedido #14' });
    expect(within(ticket).getByRole('button', { name: 'Imprimir ticket' })).toBeVisible();
    expect(within(ticket).getByText('PAGADO')).toBeVisible();
  });

  it('conserva efectivo y propina tras error y reintenta con el mismo payload', async () => {
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, total: '85.00', saldo_pendiente: '85.00' }], cursor: null });
    apiMock.collectCash.mockRejectedValueOnce(new Error('Cobro rechazado')).mockResolvedValueOnce({ cambio: '6.50' });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Cobrar $85.00 MXN' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '10%' }));
    const amount = within(dialog).getByLabelText('Efectivo recibido (MXN)');
    await user.type(amount, '90');
    expect(within(dialog).getByText('Falta').parentElement).toHaveTextContent('$3.50 MXN');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled();
    expect(apiMock.collectCash).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, '100');
    expect(within(dialog).getByText('Cambio').parentElement).toHaveTextContent('$6.50 MXN');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cobro' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cobro rechazado');
    expect(amount).toHaveValue('100.00');
    expect(within(dialog).getByRole('button', { name: '10%' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cobro' }));
    await waitFor(() => expect(apiMock.collectCash).toHaveBeenCalledTimes(2));
    expect(apiMock.collectCash.mock.calls).toEqual([
      ['token', baseOrder.id, '100.00', 4, '8.50'],
      ['token', baseOrder.id, '100.00', 4, '8.50'],
    ]);
    expect(await screen.findByText(/Cobro registrado/)).toHaveTextContent('$6.50 MXN');
  });

  it('oculta el pago mixto con el flag apagado', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'false');
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Cobrar $125.00 MXN' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Pago mixto/ })).not.toBeInTheDocument();
    expect(apiMock.recoverPendingMixedPayments).not.toHaveBeenCalled();
  });

  it('con el flag apagado una mesa se cobra igual que antes, sin abonos ni cuenta', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'false');
    apiMock.listOrders.mockResolvedValue({ orders: [mesaOrder], cursor: null });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Cobrar $125.00 MXN' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Saldo pendiente: $125.00 MXN. Confirma el efectivo recibido antes de registrar el cobro.');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cobro' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Falta por cobrar/)).not.toBeInTheDocument();
    expect(apiMock.spaceSession).not.toHaveBeenCalled();
    expect(apiMock.abonarSpaceAccount).not.toHaveBeenCalled();
    expect(apiMock.isMixedPaymentUnavailable).not.toHaveBeenCalled();
  });

  it('recupera solo los intentos de este negocio y usuario', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    render(<PosPage />, { wrapper: Wrapper });
    await waitFor(() => expect(apiMock.recoverPendingMixedPayments).toHaveBeenCalledWith('token', { establecimientoId: 'store-1', usuarioId: 'user-1' }));
  });

  it('registra pagos parciales con efectivo y terminal hasta liquidar', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    apiMock.payOrderMixed
      .mockResolvedValueOnce({ pago: { metodo_pago: 'efectivo', monto: '50.00' }, restante: '75.00', liquidada: false, pedido: baseOrder })
      .mockResolvedValueOnce({ pago: { metodo_pago: 'terminal', monto: '75.00' }, restante: '0.00', liquidada: true, pedido: baseOrder });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Pago mixto · $125.00 MXN' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Monto de este pago (MXN)'));
    await user.type(within(dialog).getByLabelText('Monto de este pago (MXN)'), '50');
    await user.type(within(dialog).getByLabelText('Efectivo recibido (MXN)'), '50');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(apiMock.payOrderMixed).toHaveBeenCalledWith('token', owner, baseOrder.id, { metodoPago: 'efectivo', monto: '50.00', montoRecibido: '50.00' }, '125.00'));
    expect(await screen.findByText(/Restan/)).toHaveTextContent('$75.00 MXN');
    expect(within(dialog).getByText('Saldo restante').parentElement).toHaveTextContent('$75.00 MXN');
    await user.click(within(dialog).getByRole('radio', { name: 'Terminal' }));
    await user.clear(within(dialog).getByLabelText('Monto de este pago (MXN)'));
    await user.type(within(dialog).getByLabelText('Monto de este pago (MXN)'), '75');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(apiMock.payOrderMixed).toHaveBeenLastCalledWith('token', owner, baseOrder.id, { metodoPago: 'terminal', monto: '75.00' }, '75.00'));
    expect(await screen.findByText('Pago registrado. Pedido liquidado.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con el flag activo abona a la mesa con el saldo real de toda la cuenta', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    apiMock.listOrders.mockResolvedValue({ orders: [mesaOrder], cursor: null });
    apiMock.spaceSession.mockResolvedValue(mesaSession());
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Abonar cuenta' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/Falta por cobrar/)).toHaveTextContent('$300.00 MXN');
    expect(within(dialog).getByText(/Saldo de toda la cuenta de Mesa 67 \(2 pedidos\)/)).toBeVisible();
    expect(apiMock.spaceSession).toHaveBeenCalledWith('token', 67);
    await user.click(within(dialog).getByRole('radio', { name: 'Terminal' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(apiMock.abonarSpaceAccount).toHaveBeenCalledWith('token', 67, expect.objectContaining({
      metodo: 'terminal', modo: 'partes', partes: 2, restanteEsperado: '300.00',
    })));
    expect(apiMock.payOrderMixed).not.toHaveBeenCalled();
    expect(apiMock.collectCash).not.toHaveBeenCalled();
  });

  it('no abona si el pedido ya no está en la cuenta abierta de la mesa', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...mesaOrder, sesion_espacio_id: 'sesion-vieja' }], cursor: null });
    apiMock.spaceSession.mockResolvedValue(mesaSession());
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Abonar cuenta' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/ya no está por cobrar en la cuenta abierta de Mesa 67/)).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
  });

  it.each([409, 422])('muestra errores %s del endpoint sin cobrar por la ruta anterior', async (status) => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    apiMock.payOrderMixed.mockRejectedValueOnce(new Error(`HTTP ${status}: saldo no disponible`));
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Pago mixto · $125.00 MXN' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Efectivo recibido (MXN)'), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByText(`HTTP ${status}: saldo no disponible`)).toBeVisible();
    expect(apiMock.collectCash).not.toHaveBeenCalled();
  });

  it('con 404 muestra un solo flujo y no vuelve a intentar al cerrar y abrir', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    const { VaiinillaApiError } = await import('../lib/api-error');
    apiMock.payOrderMixed.mockRejectedValueOnce(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Recurso no encontrado.' }));
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Pago mixto · $125.00 MXN' }));
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Efectivo recibido (MXN)'), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    expect(await within(dialog).findByText(/todavía no está disponible en el servidor/)).toBeVisible();
    expect(apiMock.markMixedPaymentUnavailable).toHaveBeenCalledWith(owner);
    expect(within(dialog).getAllByRole('button', { name: /Confirmar cobro|Registrar pago/ }).map((b) => b.textContent)).toEqual(['Confirmar cobro']);
    expect(within(dialog).queryByText('Pago mixto no disponible')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Monto de este pago (MXN)')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await user.click(await screen.findByRole('button', { name: 'Cobrar $125.00 MXN' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: 'Confirmar cobro' })).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(apiMock.payOrderMixed).toHaveBeenCalledTimes(1);
  });

  it('un 404 de pedido no encontrado no apaga el pago mixto', async () => {
    vi.stubEnv('VITE_POS_MIXED_PAYMENTS_ENABLED', 'true');
    const { VaiinillaApiError } = await import('../lib/api-error');
    apiMock.payOrderMixed.mockRejectedValueOnce(new VaiinillaApiError(404, { code: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado.' }));
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Pago mixto · $125.00 MXN' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Efectivo recibido (MXN)'), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    expect(await within(dialog).findByText('Pedido no encontrado.')).toBeVisible();
    expect(apiMock.markMixedPaymentUnavailable).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Registrar pago' })).toBeVisible();
  });

  it('exige QR después de cobrar solamente cuando la configuración lo requiere', async () => {
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, monto_pagado: '125.00', saldo_pendiente: '0.00' }], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Validar QR' })).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Validar QR' }));
    expect(await screen.findByLabelText('QR o código de 4 dígitos')).toBeVisible();
  });

  it('la pistola lectora entrega: el campo llega enfocado y su Enter confirma', async () => {
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, monto_pagado: '125.00', saldo_pendiente: '0.00' }], cursor: null });
    apiMock.deliverOrder.mockResolvedValue({ folio: 14 });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Validar QR' }));
    const campo = await screen.findByLabelText('QR o código de 4 dígitos');
    expect(campo).toHaveFocus();
    await user.keyboard('VAI-7Q2K{Enter}');
    await waitFor(() => expect(apiMock.deliverOrder).toHaveBeenCalledWith('token', 'order-14', 4, 'VAI-7Q2K'));
  });

  it('confirmar sin código no entrega y pide escanearlo', async () => {
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: true });
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, monto_pagado: '125.00', saldo_pendiente: '0.00' }], cursor: null });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Validar QR' }));
    // El botón queda habilitado para que el Enter de la pistola siempre llegue al formulario.
    const confirmar = screen.getByRole('button', { name: 'Confirmar entrega' });
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);
    expect(await screen.findByText('Escanea su QR o escribe su código de 4 dígitos.')).toBeVisible();
    expect(apiMock.deliverOrder).not.toHaveBeenCalled();
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
    expect(screen.queryByLabelText('QR o código de 4 dígitos')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(apiMock.deliverOrder).toHaveBeenCalledWith('token', 'order-14', 4, ''));
  });
});

describe('Caja: filas, la barra que prepara y el aviso de listo', () => {
  const barra1 = { id: 1, nombre: 'Barra 1', tipo: 'barra' as const };
  const barra2 = { id: 2, nombre: 'Barra 2', tipo: 'barra' as const };
  const chocolate = { id: 1, producto_id: 1, nombre_producto: 'Chocolate caliente', estacion_preparacion: 'caja' as const, cantidad: 2, precio_digital_unitario: '23.00', subtotal: '46.00', opciones: [] };
  const torta = { ...chocolate, id: 2, nombre_producto: 'Torta de jamón', estacion_preparacion: 'cocina' as const, cantidad: 1 };
  const pagado = { monto_pagado: '125.00', saldo_pendiente: '0.00', metodo_pago: 'saldo' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    sesion.rol = 'cajero';
    apiMock.activeCashSession.mockResolvedValue({ id: 'cash-1', estado: 'abierta', fondo_inicial: '500.00', abierta_en: '2026-10-07T10:00:00.000Z' });
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: false, barra_prepara: true });
    apiMock.spaces.mockResolvedValue([barra2, { id: 9, nombre: 'Mesa 9', tipo: 'mesa' }, barra1]);
  });

  it('cada caja elige su fila y deja de ver la de las demás', async () => {
    apiMock.listOrders.mockResolvedValue({ orders: [
      { ...baseOrder, ...pagado, id: 'a', folio: 21, espacio: barra1, usuario: { nombre: 'Emilio', matricula: null } },
      { ...baseOrder, ...pagado, id: 'b', folio: 18, espacio: barra2, usuario: { nombre: 'Mateo', matricula: null } },
      { ...baseOrder, ...pagado, id: 'f', folio: 30, espacio: null, usuario: { nombre: 'Lía', matricula: null } },
    ], cursor: null });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await waitFor(() => expect(apiMock.listOrders).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'] }),
    ));
    const filas = await screen.findByRole('group', { name: 'Qué fila atiendes' });
    // Cada pestaña cuenta lo que nació en su fila, igual que su columna; lo sin fila no se suma.
    expect(within(filas).getByRole('button', { name: /Todas/ })).toHaveTextContent('3');
    expect(within(filas).getByRole('button', { name: /Barra 2/ })).toHaveTextContent(/^Barra 2 1$/);
    expect(within(filas).getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
    // Con «Todas» y varias filas, una columna por fila.
    expect(await screen.findByRole('region', { name: 'Barra 1' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Barra 2' })).toBeVisible();
    // Cada renglón trae su botón principal: entregar sin abrir el ticket.
    expect(within(screen.getByRole('region', { name: 'Barra 1' })).getByRole('button', { name: 'Entregar' })).toBeVisible();

    await user.click(within(filas).getByRole('button', { name: /Barra 2/ }));
    expect(screen.getByText('1 pedido de otra fila no se muestra aquí.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Barra 1' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('caja.fila.v1:store-1')).toBe('2');
  });

  it('la barra marca listo lo suyo: pasa por preparando y avisa', async () => {
    apiMock.spaces.mockResolvedValue([]);
    const cobrado = { ...baseOrder, ...pagado, id: 'c', folio: 15, estado: 'cobrado' as const, version: 2, items: [chocolate, torta], usuario: { nombre: 'Prof. Olmos', matricula: null } };
    apiMock.listOrders.mockResolvedValue({ orders: [cobrado], cursor: null });
    apiMock.transitionOrder
      .mockResolvedValueOnce({ ...cobrado, estado: 'preparando', version: 3 })
      .mockResolvedValueOnce({ ...cobrado, estado: 'preparando', version: 4, estaciones_pendientes: ['cocina'] });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    const barra = await screen.findByRole('region', { name: /La barra prepara/ });
    // La barra solo lee lo que le toca, no la torta de cocina.
    expect(within(barra).getByText('2× Chocolate caliente')).toBeVisible();
    expect(within(barra).queryByText(/Torta/)).not.toBeInTheDocument();

    await user.click(within(barra).getByRole('button', { name: 'Marcar listo el pedido 15 y avisar al cliente' }));
    await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenNthCalledWith(1, 'token', 'c', 'preparando', 2));
    expect(apiMock.transitionOrder).toHaveBeenNthCalledWith(2, 'token', 'c', 'listo', 3);
    expect(await screen.findByText('Lo de la barra del pedido 15 está listo; falta cocina.')).toBeVisible();
  });

  it('«Ver pedido» dice el nombre del cliente al lector de pantalla', async () => {
    apiMock.spaces.mockResolvedValue([]);
    apiMock.listOrders.mockResolvedValue({ orders: [{ ...baseOrder, ...pagado, id: 'g', folio: 31, usuario: { nombre: 'Lía Prado', matricula: null } }], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Ver pedido 31 de Lía Prado' })).toBeVisible();
  });

  it('«Avisar otra vez» le recuerda al cliente y «No vino» se confirma antes', async () => {
    apiMock.spaces.mockResolvedValue([]);
    const listo = { ...baseOrder, ...pagado, id: 'h', folio: 32, version: 6, destino: 'para_llevar' as const };
    apiMock.listOrders.mockResolvedValue({ orders: [listo], cursor: null });
    apiMock.remindOrder.mockResolvedValue(undefined);
    apiMock.markNotPickedUp.mockResolvedValue({ ...listo, estado: 'no_recogido' });
    const user = userEvent.setup();
    render(<PosPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Avisar otra vez al cliente del pedido 32' }));
    await waitFor(() => expect(apiMock.remindOrder).toHaveBeenCalledWith('token', 'h'));
    expect(await screen.findByText('Le volvimos a avisar al cliente del pedido 32.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'No vino por el pedido 32' }));
    const dialog = await screen.findByRole('dialog', { name: '¿No vino por el pedido #32?' });
    // Nada se manda hasta confirmar.
    expect(apiMock.markNotPickedUp).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Sí, no vino' }));
    await waitFor(() => expect(apiMock.markNotPickedUp).toHaveBeenCalledWith('token', 'h', 6));
    expect(await screen.findByText('El pedido 32 quedó como no recogido.')).toBeVisible();
  });

  it('una cuenta abierta de mesa no ofrece «No vino» ni avisar', async () => {
    apiMock.spaces.mockResolvedValue([]);
    const deMesa = { ...baseOrder, id: 'i', folio: 33, destino: 'en_espacio' as const, espacio: { id: 9, nombre: 'Mesa 9', tipo: 'mesa' as const }, pago_diferido: true, pago_pendiente: true };
    apiMock.listOrders.mockResolvedValue({ orders: [deMesa], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: /^Ver pedido 33 de / })).toBeVisible();
    expect(screen.queryByRole('button', { name: /No vino/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avisar otra vez/ })).not.toBeInTheDocument();
  });

  it('un pedido listo dice cuánto lleva avisado el cliente', async () => {
    apiMock.spaces.mockResolvedValue([]);
    const listo = { ...baseOrder, ...pagado, id: 'd', folio: 9, listo_en: new Date(Date.now() - 4 * 60_000 - 5_000).toISOString() };
    const otro = { ...listo, id: 'e', folio: 11 };
    apiMock.listOrders.mockResolvedValue({ orders: [listo, otro], cursor: null });
    render(<PosPage />, { wrapper: Wrapper });
    // Cada tarjeta lista dice cuánto lleva avisado su cliente.
    expect(await screen.findAllByText('Avisado hace 4 min')).toHaveLength(2);
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
    apiMock.businessSettings.mockResolvedValue({ permite_pago_al_final: false, tipo: 'cafeteria', entrega_requiere_qr: true, gracia_liberacion_min: 5, franjas_pedido: [] });
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
