import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { schoolSettingsFixture } from '../test/school-fixtures';
import { TenantDashboardPage } from './tenant-dashboard-page';

// Con la bandera prendida: el acceso a Escuela sale solo si el negocio tiene modo escuela.
vi.mock('../lib/school-admin-feature', () => ({ SCHOOL_ADMIN_ENABLED: true }));
const apiMock = vi.hoisted(() => ({ tenantAnalytics: vi.fn(), listInvitations: vi.fn(), activeCashSession: vi.fn(), listOrders: vi.fn(), hotelSettings: vi.fn(), businessSettings: vi.fn() }));
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
  apiMock.tenantAnalytics.mockResolvedValue({ resumen: { ventas_totales: '0.00', pedidos: 0, ticket_promedio: '0.00', propinas: '0.00', recargas: '0.00', comisiones: '0.00' }, productos: [], metodos_pago: [], ventas_por_dia: [], pedidos_por_estado: [], calculado_en: '2026-11-10T18:00:00Z' });
  apiMock.listInvitations.mockResolvedValue({ invitations: [] });
  apiMock.activeCashSession.mockResolvedValue(null);
  apiMock.listOrders.mockResolvedValue({ orders: [], cursor: null });
});

it('muestra el acceso a Escuela en un negocio con modo escuela', async () => {
  apiMock.businessSettings.mockResolvedValue(schoolSettingsFixture());
  setup();
  expect(await screen.findByRole('link', { name: 'Escuela' })).toHaveAttribute('href', '/app/escuela');
  expect(apiMock.businessSettings).toHaveBeenCalledWith('token');
});

it('no muestra el acceso a Escuela si el negocio no es escuela', async () => {
  apiMock.businessSettings.mockResolvedValue(schoolSettingsFixture({ modo_escuela: false }));
  setup();
  await waitFor(() => expect(apiMock.businessSettings).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: 'Escuela' })).not.toBeInTheDocument();
});
