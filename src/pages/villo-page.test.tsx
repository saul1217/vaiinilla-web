import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSessions } from '../context/session-context';
import { useAuth } from '../context/auth-context';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VilloPage } from './villo-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();

vi.mock('../context/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'owner-uid', getIdToken: vi.fn().mockResolvedValue('firebase-token') }, ready: true, configured: true, signOut: vi.fn() })),
}));
vi.mock('../context/session-context', () => ({
  useSessions: vi.fn(() => ({ platform: { token: 'fixture' }, clearAll: vi.fn() })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={['/villo']}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.mocked(useSessions).mockReturnValue({ platform: { token: 'fixture' }, clearAll: vi.fn() } as unknown as ReturnType<typeof useSessions>);
  vi.mocked(useAuth).mockReturnValue({ user: { uid: 'owner-uid', getIdToken: vi.fn().mockResolvedValue('firebase-token') } } as unknown as ReturnType<typeof useAuth>);
});
afterAll(() => server.close());

describe('Sección privada /villo', () => {
  it('con 204 en acceso y una guía válida, renderiza el markdown', async () => {
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${baseUrl}/villo/owner/guia`, () =>
        HttpResponse.json({
          data: { markdown: '# Guía\n\nTabla:\n\n| A | B |\n| --- | --- |\n| 1 | 2 |', actualizado_en: '2026-11-09T12:00:00Z' },
          meta: {},
          error: null,
        }),
      ),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Villo' })).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('con 404 de acceso se muestra la 404 estándar', async () => {
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
  });

  it('si la sesión normal no está habilitada, conserva el acceso de plataforma', async () => {
    let intentos = 0;
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, ({ request }) => {
        intentos += 1;
        if (intentos === 1) {
          expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
          return new HttpResponse(null, { status: 404 });
        }
        expect(request.headers.get('Authorization')).toBe('Bearer fixture');
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${baseUrl}/villo/owner/guia`, () =>
        HttpResponse.json({
          data: { markdown: '# Guía', actualizado_en: '2026-11-09T12:00:00Z' },
          meta: {},
          error: null,
        }),
      ),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Villo' })).toBeInTheDocument();
    expect(intentos).toBe(2);
  });

  it('con estado distinto de 204 se muestra la 404 estándar', async () => {
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, () =>
        HttpResponse.json({ data: {}, meta: {}, error: null }, { status: 200 }),
      ),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
  });

  it('con error de red se muestra la 404 estándar', async () => {
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, () => HttpResponse.error()),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
  });

  it('sin sesión se muestra la 404 estándar', async () => {
    vi.mocked(useSessions).mockReturnValue({ platform: null, clearAll: vi.fn() } as unknown as ReturnType<typeof useSessions>);
    vi.mocked(useAuth).mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    server.use(
      http.get(`${baseUrl}/villo/owner/acceso`, ({ request }) => {
        expect(request.headers.has('Authorization')).toBe(false);
        return new HttpResponse(null, { status: 404 });
      }),
    );
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
  });
});

