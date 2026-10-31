import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TenantDashboardPage } from './tenant-dashboard-page';
const apiMock = vi.hoisted(() => ({ tenantAnalytics: vi.fn(), listInvitations: vi.fn(), activeCashSession: vi.fn(), listOrders: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'token', context: { establecimiento_id: 'store' }, access: { establecimiento: { nombre: 'Mi negocio' } } } }) }));
vi.mock('../components/operational-status-panel', () => ({ OperationalStatusPanel: () => <div>Estado operativo</div> }));
vi.mock('../components/unpaid-accounts-card', () => ({ UnpaidAccountsCard: () => <div>Cuentas sin cobrar</div> }));
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 render(<QueryClientProvider client={client}><MemoryRouter><TenantDashboardPage /></MemoryRouter></QueryClientProvider>);
 return userEvent.setup();
}
beforeEach(() => {
 vi.resetAllMocks();
 apiMock.tenantAnalytics.mockResolvedValue({ resumen: { ventas_totales: '100.00', pedidos: 2, ticket_promedio: '50.00', propinas: '5.00', recargas: '200.00', comisiones: '3.00' }, productos: [], metodos_pago: [], ventas_por_dia: [], pedidos_por_estado: [], calculado_en: '2026-10-30T18:00:00Z' });
 apiMock.listInvitations.mockResolvedValue({ invitations: [] });
 apiMock.activeCashSession.mockResolvedValue(null);
 apiMock.listOrders.mockResolvedValue({ orders: [{}], cursor: 'next' });
});
it('separa venta, propinas y recargas y conserva periodo y conteos parciales', async () => {
 const user = setup();
 expect(screen.getByRole('heading', { level: 1, name: 'Mi negocio' })).toBeInTheDocument();
 expect(await screen.findByText('$100.00')).toBeInTheDocument();
 expect(screen.getByText('$5.00')).toBeInTheDocument();
 expect(screen.getByText('$200.00')).toBeInTheDocument();
 expect(screen.getByText('1+')).toBeInTheDocument();
 expect(screen.getByRole('complementary', { name: 'Ahora' })).toBeInTheDocument();
 await user.click(screen.getByRole('button', { name: 'Hoy' }));
 await waitFor(() => expect(apiMock.tenantAnalytics).toHaveBeenCalledTimes(2));
 const period = apiMock.tenantAnalytics.mock.calls[1]![1] as { desde: string; hasta: string };
 expect(period.desde).toBe(period.hasta);
 expect(apiMock.listOrders).toHaveBeenCalledTimes(1);
 expect(apiMock.listOrders).toHaveBeenCalledWith('token', { estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'], limit: 100 });
});
it('errores independientes no simulan Caja cerrada ni cero invitaciones', async () => {
 apiMock.activeCashSession.mockRejectedValue(new Error('Caja sin red'));
 apiMock.listInvitations.mockRejectedValue(new Error('Invitaciones sin red'));
 setup();
 expect(await screen.findByText(/Caja sin red/)).toBeInTheDocument();
 expect(screen.getByText(/Invitaciones sin red/)).toBeInTheDocument();
 expect(screen.queryByText('Cerrada')).not.toBeInTheDocument();
 expect(screen.getAllByText('No disponible')).toHaveLength(2);
 expect(screen.getByText('$100.00')).toBeInTheDocument();
});
