import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { settingsFixture } from '../test/hotel-fixtures';
import { TenantDashboardPage } from './tenant-dashboard-page';

// Con la bandera prendida: el acceso a Hotel sale solo si el negocio tiene hotel.
vi.mock('../lib/hotel-admin-feature', () => ({ HOTEL_ADMIN_ENABLED: true }));
const apiMock = vi.hoisted(() => ({ tenantAnalytics: vi.fn(), listInvitations: vi.fn(), activeCashSession: vi.fn(), listOrders: vi.fn(), hotelSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'token', context: { establecimiento_id: 'store' }, access: { establecimiento: { nombre: 'Mi negocio' } } } }) }));
vi.mock('../components/operational-status-panel', () => ({ OperationalStatusPanel: () => <div>Estado operativo</div> }));
vi.mock('../components/unpaid-accounts-card', () => ({ UnpaidAccountsCard: () => <div>Cuentas sin cobrar</div> }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><TenantDashboardPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.tenantAnalytics.mockResolvedValue({ resumen: { ventas_totales: '0.00', pedidos: 0, ticket_promedio: '0.00', propinas: '0.00', recargas: '0.00', comisiones: '0.00' }, productos: [], metodos_pago: [], ventas_por_dia: [], pedidos_por_estado: [], calculado_en: '2026-11-09T18:00:00Z' });
  apiMock.listInvitations.mockResolvedValue({ invitations: [] });
  apiMock.activeCashSession.mockResolvedValue(null);
  apiMock.listOrders.mockResolvedValue({ orders: [], cursor: null });
});

it('muestra el acceso a Hotel en un negocio con hotel', async () => {
  apiMock.hotelSettings.mockResolvedValue(settingsFixture());
  setup();
  expect(await screen.findByRole('link', { name: 'Hotel' })).toHaveAttribute('href', '/app/hotel');
  expect(apiMock.hotelSettings).toHaveBeenCalledWith('token');
});

it('no muestra el acceso a Hotel si el negocio no es hotel', async () => {
  apiMock.hotelSettings.mockResolvedValue(settingsFixture({ activo: false }));
  setup();
  await waitFor(() => expect(apiMock.hotelSettings).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: 'Hotel' })).not.toBeInTheDocument();
});
