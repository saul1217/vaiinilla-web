import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
import { KitchenPage } from './kitchen-page';

const apiMock = vi.hoisted(() => ({
  listOrders: vi.fn(),
  transitionOrder: vi.fn(),
  rejectOrder: vi.fn(),
  operationalStatus: vi.fn(),
  catalog: vi.fn(),
  changeProductAvailability: vi.fn(),
  schoolReservedDay: vi.fn(),
  inventoryAlerts: vi.fn(),
}));

const sessionRole = vi.hoisted(() => ({ value: 'cocina' }));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'tenant-token',
      context: { establecimiento_id: 'establecimiento-1', rol: sessionRole.value },
      access: { establecimiento: { nombre: 'Caffenio' } },
    },
  }),
}));
vi.mock('../hooks/use-operational-heartbeat', () => ({
  useOperationalHeartbeat: () => ({ isSuccess: true, isError: false }),
}));
vi.mock('../components/operational-status-panel', () => ({
  OperationalStatusPanel: () => <div>Estado operativo</div>,
}));

const pendingOrder: OrderDetail = {
  id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
  folio: 42,
  fecha_operativa: '2026-08-12',
  estado: 'cobrado',
  metodo_pago: 'efectivo',
  destino: 'para_llevar',
  espacio: null,
  subtotal: '46.00',
  ahorro_combinado: '0.00',
  cashback_otorgado: '0.00',
  total: '46.00',
  version: 2,
  creado_en: '2026-08-12T18:30:00.000Z',
  actualizado_en: '2026-08-12T18:31:00.000Z',
  notas_cocina: 'Sin azúcar',
  usuario: { nombre: 'Ana Pérez', matricula: 'A01234' },
  items: [
    {
      id: 501,
      producto_id: 101,
      nombre_producto: 'Chocolate caliente',
      estacion_preparacion: 'cocina',
      cantidad: 2,
      precio_digital_unitario: '23.00',
      subtotal: '46.00',
      opciones: [{ opcion_id: 7, nombre: 'Leche deslactosada', precio_extra: '0.00' }],
    },
  ],
};

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('tablero de Cocina', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRole.value = 'cocina';
    apiMock.listOrders.mockResolvedValue({ orders: [pendingOrder], cursor: null });
    apiMock.transitionOrder.mockResolvedValue({
      ...pendingOrder,
      estado: 'preparando',
      version: 3,
    });
    apiMock.operationalStatus.mockResolvedValue({ modo_escuela: false });
    apiMock.inventoryAlerts.mockResolvedValue({ agotados: [], para_manana: [], bajo_minimo: [] });
  });

  it.each(['cocina', 'admin'])('respeta el tema claro elegido por %s al entrar y salir', (role) => {
    sessionRole.value = role;
    const previousTheme = document.documentElement.dataset.adminTheme;
    const previousPreference = window.localStorage.getItem('vaiinilla.panel.admin-theme');
    document.documentElement.dataset.adminTheme = 'claro';
    window.localStorage.setItem('vaiinilla.panel.admin-theme', 'claro');
    const { unmount } = render(<KitchenPage />, { wrapper: TestProvider });
    try {
      expect(screen.getByRole('heading', { name: 'Cocina', level: 1 })).toBeInTheDocument();
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

  it('aplica la UI nueva a Cocina y conserva su encabezado y estado operativo', async () => {
    sessionRole.value = 'cocina';
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    const { container } = render(<KitchenPage />, { wrapper: TestProvider });
    expect(container.firstChild).toHaveClass('staff-page');
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cocina' })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listOrders).toHaveBeenCalled());
    await userEvent.setup().click(screen.getByText('Estado operativo del establecimiento'));
    expect(screen.getByText('Estado operativo')).toBeVisible();
  });

  it('muestra las tres etapas y únicamente los artículos devueltos para Cocina', async () => {
    render(<KitchenPage />, { wrapper: TestProvider });

    expect(await screen.findByText('Chocolate caliente')).toBeVisible();
    expect(screen.getByLabelText('2 unidades')).toBeVisible();
    expect(screen.getByText('Leche deslactosada')).toBeVisible();
    expect(screen.getByText('Sin azúcar')).toBeVisible();
    expect(screen.getByText('Para llevar')).toBeVisible();
    expect(screen.getByText('Ana Pérez')).toBeVisible();
    expect(screen.getByText('A01234')).toBeVisible();
    expect(screen.getByText('2 piezas')).toBeVisible();
    expect(screen.getByText('1 producto')).toBeVisible();
    expect(screen.getByRole('heading', { name: /^Pendientes ·/, level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^En preparación ·/, level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^Listos ·/, level: 2 })).toBeVisible();
    expect(apiMock.listOrders).toHaveBeenCalledWith('tenant-token', {
      estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'],
      cursor: undefined,
      limit: 50,
    });
  });

  it('permite solicitar una actualización manual además del refresco automático', async () => {
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    await screen.findByText('Chocolate caliente');
    await user.click(screen.getByRole('button', { name: 'Actualizar comandas ahora' }));

    await waitFor(() => expect(apiMock.listOrders).toHaveBeenCalledTimes(2));
  });

  it('inicia la preparación con la versión vigente del pedido', async () => {
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'Comenzar preparación' }));

    await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledWith(
      'tenant-token',
      pendingOrder.id,
      'preparando',
      2,
    ));
    expect(await screen.findByText('Pedido 42 enviado a preparación.')).toBeVisible();
  });

  it('recibe y puede iniciar la preparación de un pedido por cobrar', async () => {
    const unpaidOrder = { ...pendingOrder, estado: 'por_cobrar' as const, monto_pagado: '0.00', saldo_pendiente: '46.00' };
    apiMock.listOrders.mockResolvedValue({ orders: [unpaidOrder], cursor: null });
    apiMock.transitionOrder.mockResolvedValue({ ...unpaidOrder, estado: 'preparando', version: 3 });
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    expect(await screen.findByText('Chocolate caliente')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Comenzar preparación' }));
    await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledWith(
      'tenant-token', unpaidOrder.id, 'preparando', unpaidOrder.version,
    ));
  });

  it('pone todas las comandas pendientes en preparación con su versión vigente', async () => {
    const otherOrder: OrderDetail = { ...pendingOrder, id: 'otro-pedido', folio: 43, version: 5 };
    apiMock.listOrders.mockResolvedValue({ orders: [pendingOrder, otherOrder], cursor: null });
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'Poner todo en preparación' }));

    await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledTimes(2));
    expect(apiMock.transitionOrder).toHaveBeenCalledWith('tenant-token', pendingOrder.id, 'preparando', 2);
    expect(apiMock.transitionOrder).toHaveBeenCalledWith('tenant-token', 'otro-pedido', 'preparando', 5);
  });

  it('marca como listo un pedido que estaba en preparación después de 5 s, con la versión vigente', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const preparingOrder: OrderDetail = { ...pendingOrder, estado: 'preparando', version: 3 };
      apiMock.listOrders.mockResolvedValue({ orders: [preparingOrder], cursor: null });
      apiMock.transitionOrder.mockResolvedValue({ ...preparingOrder, estado: 'listo', version: 4 });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<KitchenPage />, { wrapper: TestProvider });

      await user.click(await screen.findByRole('button', { name: 'Marcar como listo' }));
      // Durante la ventana para deshacer no se manda nada.
      expect(await screen.findByText(/Pedido 42 listo · se manda en/)).toBeVisible();
      expect(apiMock.transitionOrder).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10_500);
      await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledWith('tenant-token', pendingOrder.id, 'listo', 3));
      expect(await screen.findByText('Pedido 42 marcado como listo.')).toBeVisible();
      expect(screen.queryByRole('button', { name: /entregar|validar qr/i })).not.toBeInTheDocument();
      expect(apiMock.transitionOrder.mock.calls.every((call) => call[2] !== 'entregado')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Deshacer» dentro de los 5 s no manda nada y regresa la comanda', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const preparingOrder: OrderDetail = { ...pendingOrder, estado: 'preparando', version: 3 };
      apiMock.listOrders.mockResolvedValue({ orders: [preparingOrder], cursor: null });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<KitchenPage />, { wrapper: TestProvider });

      await user.click(await screen.findByRole('button', { name: 'Marcar como listo' }));
      await user.click(await screen.findByRole('button', { name: 'Deshacer listo del pedido 42' }));
      await vi.advanceTimersByTimeAsync(11_000);
      expect(apiMock.transitionOrder).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Marcar como listo' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('en una escuela ofrece «Para mañana» y con inventario avisa lo que se acabó', async () => {
    apiMock.operationalStatus.mockResolvedValue({ modo_escuela: true });
    apiMock.inventoryAlerts.mockResolvedValue({ agotados: [{ id: 1, nombre: 'Molletes', faltan: ['Bolillo'] }], para_manana: [], bajo_minimo: [] });
    apiMock.schoolReservedDay.mockImplementation((_t: string, fecha: string) => Promise.resolve({
      fecha, pedidos: 3, sin_servicio: null, productos: [{ producto_id: 9, nombre: 'Sándwich', cantidad: 3, pedidos: 3 }],
    }));
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    expect(await screen.findByText('Se acabó: Bolillo')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Para mañana' }));
    expect(await screen.findByText('3 apartados.')).toBeInTheDocument();
    expect(screen.getByText('Sándwich')).toBeInTheDocument();
  });

  it('«¿Qué se acabó?» apaga un producto y lo dice', async () => {
    apiMock.catalog.mockResolvedValue({ categorias: [], productos: [{ id: 5, nombre: 'Molletes', disponible: true }, { id: 6, nombre: 'Chilaquiles', disponible: false }] });
    apiMock.changeProductAvailability.mockResolvedValue({ id: 5, nombre: 'Molletes', disponible: false });
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: '¿Qué se acabó?' }));
    const off = await screen.findByRole('switch', { name: 'Chilaquiles: se acabó' });
    expect(off).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('switch', { name: 'Molletes: se ofrece' }));
    await waitFor(() => expect(apiMock.changeProductAvailability).toHaveBeenCalledWith('tenant-token', 5, false));
    expect(await screen.findByText('Molletes ya no se ofrece en el menú ni en Caja.')).toBeInTheDocument();
  });

  it('identifica pedidos de mesa y no ofrece entrega', async () => {
    apiMock.listOrders.mockResolvedValue({
      orders: [
        {
          ...pendingOrder,
          destino: 'en_espacio',
          espacio: { id: 4, nombre: 'Mesa 4', tipo: 'mesa' },
        },
      ],
      cursor: null,
    });
    render(<KitchenPage />, { wrapper: TestProvider });
    expect(await screen.findByText('Mesa 4')).toBeVisible();
    expect(screen.queryByRole('button', { name: /entregar|validar qr/i })).not.toBeInTheDocument();
  });
  it('rechaza un pedido con motivo y avisa que el cliente lo verá', async () => {
    const user = userEvent.setup();
    apiMock.rejectOrder.mockResolvedValue(undefined);
    render(<KitchenPage />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'No se puede preparar' }));
    const confirm = screen.getByRole('button', { name: 'Rechazar pedido' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), 'Se terminó el chocolate');
    await user.click(confirm);

    await waitFor(() => expect(apiMock.rejectOrder).toHaveBeenCalledWith(
      'tenant-token',
      pendingOrder.id,
      2,
      'Se terminó el chocolate',
    ));
    expect(await screen.findByText('Pedido 42 rechazado. El cliente verá el motivo.')).toBeVisible();
  });
});

it('un error de transición conserva la comanda y reintenta con la misma versión', async () => {
  const user = userEvent.setup();
  apiMock.listOrders.mockResolvedValue({ orders: [pendingOrder], cursor: null });
  apiMock.transitionOrder.mockReset().mockRejectedValueOnce(new Error('Error de transición')).mockResolvedValueOnce({ ...pendingOrder, estado: 'preparando', version: 3 });
  render(<KitchenPage />, { wrapper: TestProvider });
  await user.click(await screen.findByRole('button', { name: 'Comenzar preparación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Error de transición');
  expect(screen.getByRole('article', { name: 'Pedido 42, Nueva' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Comenzar preparación' }));
  await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledTimes(2));
  expect(apiMock.transitionOrder.mock.calls).toEqual([
    ['tenant-token', pendingOrder.id, 'preparando', 2], ['tenant-token', pendingOrder.id, 'preparando', 2],
  ]);
});
