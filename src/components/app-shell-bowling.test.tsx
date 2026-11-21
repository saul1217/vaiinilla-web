import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';

// «Pistas» solo en un boliche: el tipo sale de GET /reservas/disponibilidad, que contesta cualquier rol.
vi.mock('../lib/bowling-admin-feature', () => ({ BOWLING_ADMIN_ENABLED: true }));
const session = vi.hoisted(() => ({ role: 'mesero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { token: 'token-1', context: { rol: session.role, establecimiento_id: 'negocio-1' }, access: { establecimiento: { nombre: 'Negocio' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
let tipo = 'boliche';
let calls = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); tipo = 'boliche'; calls = 0; });
afterAll(() => server.close());

function renderShell(role: string) {
  session.role = role;
  server.use(http.get(`${baseUrl}/reservas/disponibilidad`, () => {
    calls += 1;
    return HttpResponse.json({ data: { tipo_establecimiento: tipo, canchas: [] }, meta: {}, error: null });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><TenantShell>Contenido</TenantShell></QueryClientProvider></MemoryRouter>);
}

it('Mesero ve «Pistas» en un boliche', async () => {
  renderShell('mesero');
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(await within(mobile).findByRole('link', { name: 'Pistas' })).toHaveAttribute('href', '/app/boliche');
});

it('admin encuentra «Pistas de boliche» en «Más»', async () => {
  renderShell('admin');
  await vi.waitFor(() => expect(calls).toBe(1));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
  expect(await within(screen.getByRole('navigation', { name: 'Más destinos' })).findByRole('link', { name: 'Pistas de boliche' })).toHaveAttribute('href', '/app/boliche');
});

it('en un negocio que no es boliche no aparece «Pistas»', async () => {
  tipo = 'padel';
  renderShell('mesero');
  await vi.waitFor(() => expect(calls).toBe(1));
  expect(screen.queryByRole('link', { name: 'Pistas' })).not.toBeInTheDocument();
});

it('Cocina no pregunta el tipo de negocio', () => {
  renderShell('cocina');
  expect(calls).toBe(0);
  expect(screen.queryByRole('link', { name: 'Pistas' })).not.toBeInTheDocument();
});
