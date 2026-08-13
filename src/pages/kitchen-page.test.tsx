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
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'tenant-token',
      context: { establecimiento_id: 'establecimiento-1', rol: 'cocina' },
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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('tablero de Cocina', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.listOrders.mockResolvedValue({ orders: [pendingOrder], cursor: null });
    apiMock.transitionOrder.mockResolvedValue({
      ...pendingOrder,
      estado: 'preparando',
      version: 3,
    });
  });

  it('muestra las tres etapas y únicamente los artículos devueltos para Cocina', async () => {
    render(<KitchenPage />, { wrapper: TestProvider });

    expect(await screen.findByText('Chocolate caliente')).toBeVisible();
    expect(screen.getByText('2×')).toBeVisible();
    expect(screen.getByText('Leche deslactosada')).toBeVisible();
    expect(screen.getByText('Sin azúcar')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'En preparación' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Listos' })).toBeVisible();
    expect(apiMock.listOrders).toHaveBeenCalledWith('tenant-token', {
      estado: ['cobrado', 'preparando', 'listo'],
      cursor: undefined,
      limit: 50,
    });
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

  it('marca como listo un pedido que estaba en preparación', async () => {
    const preparingOrder: OrderDetail = {
      ...pendingOrder,
      estado: 'preparando',
      version: 3,
    };
    apiMock.listOrders.mockResolvedValue({ orders: [preparingOrder], cursor: null });
    apiMock.transitionOrder.mockResolvedValue({
      ...preparingOrder,
      estado: 'listo',
      version: 4,
    });
    const user = userEvent.setup();
    render(<KitchenPage />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'Marcar como listo' }));

    await waitFor(() => expect(apiMock.transitionOrder).toHaveBeenCalledWith(
      'tenant-token',
      pendingOrder.id,
      'listo',
      3,
    ));
    expect(await screen.findByText('Pedido 42 marcado como listo.')).toBeVisible();
  });
});
