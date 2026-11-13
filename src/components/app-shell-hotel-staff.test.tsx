import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { settingsFixture } from '../test/hotel-fixtures';
import { TenantShell } from './app-shell';

// Con la bandera prendida: Recepción para Caja y Administración, Habitaciones para Mesero y Administración, y solo en un hotel.
vi.mock('../lib/hotel-staff-feature', () => ({ HOTEL_STAFF_ENABLED: true }));
const session = vi.hoisted(() => ({ role: 'cajero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { token: 'tenant-token', context: { rol: session.role, establecimiento_id: 'hotel-1' }, access: { establecimiento: { nombre: 'Hotel' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
let active = true;
let calls = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); active = true; calls = 0; });
afterAll(() => server.close());

function renderShell(role: string) {
  session.role = role;
  server.use(http.get(`${baseUrl}/hotel/configuracion`, () => { calls += 1; return HttpResponse.json({ data: settingsFixture({ activo: active }), meta: {}, error: null }); }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><TenantShell>Contenido</TenantShell></QueryClientProvider></MemoryRouter>);
}

it('Caja ve Recepción en un hotel', async () => {
  renderShell('cajero');
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(await within(mobile).findByRole('link', { name: 'Recepción' })).toHaveAttribute('href', '/app/hotel/recepcion');
  expect(within(mobile).queryByRole('link', { name: 'Habitaciones' })).not.toBeInTheDocument();
});

it('Mesero ve Habitaciones en un hotel', async () => {
  renderShell('mesero');
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(await within(mobile).findByRole('link', { name: 'Habitaciones' })).toHaveAttribute('href', '/app/hotel/ama-de-llaves');
  expect(within(mobile).queryByRole('link', { name: 'Recepción' })).not.toBeInTheDocument();
});

it('en un negocio sin hotel no aparece nada de hotel', async () => {
  active = false;
  renderShell('cajero');
  await vi.waitFor(() => expect(calls).toBe(1));
  expect(screen.queryByRole('link', { name: 'Recepción' })).not.toBeInTheDocument();
});

it('Cocina no consulta el hotel', () => {
  renderShell('cocina');
  expect(calls).toBe(0);
  expect(screen.queryByRole('link', { name: 'Recepción' })).not.toBeInTheDocument();
});
