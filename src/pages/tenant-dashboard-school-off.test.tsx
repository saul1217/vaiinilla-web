import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TenantDashboardPage } from './tenant-dashboard-page';

// Con la bandera apagada (su valor por defecto) no se consulta nada de la escuela.
vi.mock('../lib/school-admin-feature', () => ({ SCHOOL_ADMIN_ENABLED: false }));
const apiMock = vi.hoisted(() => ({ tenantAnalytics: vi.fn(), listInvitations: vi.fn(), activeCashSession: vi.fn(), listOrders: vi.fn(), hotelSettings: vi.fn(), businessSettings: vi.fn(), schoolRoster: vi.fn(), saveSchoolRoster: vi.fn(), saveSchoolSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'token', context: { establecimiento_id: 'store' }, access: { establecimiento: { nombre: 'Mi negocio' } } } }) }));
vi.mock('../components/operational-status-panel', () => ({ OperationalStatusPanel: () => <div>Estado operativo</div> }));
vi.mock('../components/unpaid-accounts-card', () => ({ UnpaidAccountsCard: () => <div>Cuentas sin cobrar</div> }));

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.tenantAnalytics.mockResolvedValue({ resumen: { ventas_totales: '0.00', pedidos: 0, ticket_promedio: '0.00', propinas: '0.00', recargas: '0.00', comisiones: '0.00' }, productos: [], metodos_pago: [], ventas_por_dia: [], pedidos_por_estado: [], calculado_en: '2026-11-10T18:00:00Z' });
  apiMock.listInvitations.mockResolvedValue({ invitations: [] });
  apiMock.activeCashSession.mockResolvedValue(null);
  apiMock.listOrders.mockResolvedValue({ orders: [], cursor: null });
});

it('con SCHOOL_ADMIN_ENABLED en false no llama a la API de la escuela ni muestra el acceso', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><TenantDashboardPage /></MemoryRouter></QueryClientProvider>);
  // Espera a que el inicio cargue lo que sí consulta.
  await vi.waitFor(() => expect(apiMock.tenantAnalytics).toHaveBeenCalled());
  await vi.waitFor(() => expect(apiMock.activeCashSession).toHaveBeenCalled());
  expect(apiMock.businessSettings).not.toHaveBeenCalled();
  expect(apiMock.schoolRoster).not.toHaveBeenCalled();
  expect(apiMock.saveSchoolRoster).not.toHaveBeenCalled();
  expect(apiMock.saveSchoolSettings).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Escuela' })).not.toBeInTheDocument();
});
