import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { AGENDA_ENABLED } from '../lib/agenda-feature';
import { AgendaPage } from './agenda-page';

// Bandera real (apagada): la página no monta nada que llame a la API y regresa al inicio del rol.
const server = setupServer();
const seen: string[] = [];
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: 'cajero', establecimiento_id: 'e-1', membresia_id: 'm-1' } } }),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('con la bandera apagada no llama a la API y redirige al inicio del rol', async () => {
  expect(AGENDA_ENABLED).toBe(false);
  server.events.on('request:start', ({ request }) => { seen.push(request.url); });
  server.use(http.all('*', () => HttpResponse.json({ data: null, meta: {}, error: null })));
  let location = '';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter initialEntries={['/app/agenda']}>
    <QueryClientProvider client={client}><AgendaPage /></QueryClientProvider>
    <Route path="*" render={({ location: current }) => { location = current.pathname; return null; }} />
  </MemoryRouter>);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(location).toBe('/app/pos');
  expect(seen).toEqual([]);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
