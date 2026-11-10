/* eslint-disable @typescript-eslint/unbound-method */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSessions } from '../context/session-context';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { VaiinillaApiError } from '../lib/api-error';
import { completeTotpSignIn, passwordSignIn } from '../lib/firebase';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VilloPage } from './villo-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const clearAll = vi.fn().mockResolvedValue(undefined);
let currentUser: { uid: string; getIdToken: () => Promise<string> } | null;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('../lib/firebase', () => ({ passwordSignIn: vi.fn(), completeTotpSignIn: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { ...actual.api, villoOwnerAccess: vi.fn() } };
});
vi.mock('../context/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: currentUser, ready: true, configured: true, signOut: vi.fn(() => { currentUser = null; return Promise.resolve(); }) })),
}));
vi.mock('../context/session-context', () => ({
  useSessions: vi.fn(() => ({ platform: { token: 'fixture' }, clearAll })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={['/villo']}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MemoryRouter>;
}

const ownerUser = () => ({ uid: 'owner-uid', getIdToken: vi.fn().mockResolvedValue('firebase-token') });
const envelope = (markdown = '# Guía técnica ESP32') => HttpResponse.json({ data: { markdown, actualizado_en: '2026-11-09T12:00:00Z' }, meta: { page: null, total_pages: null, total_items: null, cursor: null }, error: null });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  queryClient.clear();
  vi.stubEnv('MODE', 'production');
  currentUser = ownerUser();
  clearAll.mockClear();
  vi.mocked(useSessions).mockReturnValue({ platform: { token: 'fixture' }, clearAll } as unknown as ReturnType<typeof useSessions>);
  vi.mocked(useAuth).mockImplementation(() => ({
    user: currentUser as unknown as ReturnType<typeof useAuth>['user'],
    ready: true,
    configured: true,
    signOut: vi.fn(() => { currentUser = null; return Promise.resolve(); }),
  }));
  vi.mocked(passwordSignIn).mockImplementation(() => {
    currentUser = ownerUser();
    return Promise.resolve({ user: currentUser as unknown as NonNullable<ReturnType<typeof useAuth>['user']> });
  });
  vi.mocked(completeTotpSignIn).mockResolvedValue(ownerUser() as unknown as NonNullable<ReturnType<typeof useAuth>['user']>);
  vi.mocked(api.villoOwnerAccess).mockResolvedValue(undefined);
  server.use(
    http.get(`${baseUrl}/sesiones/accesos`, () => HttpResponse.json({ data: [], meta: {}, error: null })),
    http.get(`${baseUrl}/villo/owner/guia`, () => envelope()),
  );
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); server.resetHandlers(); });
afterAll(() => server.close());

describe('Sección privada /villo', () => {
  it('muestra siempre el formulario, también en producción sin sesión', () => {
    currentUser = null;
    render(<VilloPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByText(/reemplaza la sesión actual de Vaiinilla/)).toBeInTheDocument();
  });

  it('login OK más 204 muestra la guía y dispositivos', async () => {
    currentUser = null;
    render(<VilloPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'bimbose714@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(vi.mocked(api.villoOwnerAccess)).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Villo' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Guía técnica ESP32' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dispositivos' })).toBeInTheDocument();
    expect(vi.mocked(api.villoOwnerAccess)).toHaveBeenCalledWith('firebase-token');
    expect(passwordSignIn).toHaveBeenCalledWith('bimbose714@example.com', 'correct-horse-battery', true);
    expect(clearAll).toHaveBeenCalled();
    const guideQuery = queryClient.getQueryCache().findAll({ queryKey: ['villo-owner-guide'] })[0];
    expect(guideQuery?.queryKey).toEqual(['villo-owner-guide', 'owner-uid']);
    expect(JSON.stringify(guideQuery?.queryKey)).not.toContain('firebase-token');
  });

  it('muestra un mensaje genérico si falla la carga de la guía', async () => {
    server.use(http.get(`${baseUrl}/villo/owner/guia`, () => HttpResponse.json({ data: null, meta: {}, error: { code: 'INTERNAL_ERROR', message: 'detalle interno' } }, { status: 500 })));
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('No pudimos cargar la guía. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.queryByText('detalle interno')).not.toBeInTheDocument();
  });

  it('muestra un mensaje genérico si la guía viene vacía', async () => {
    server.use(http.get(`${baseUrl}/villo/owner/guia`, () => envelope('   ')));
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('No pudimos cargar la guía. Inténtalo de nuevo.')).toBeInTheDocument();
  });

  it('login OK más 404 muestra el mensaje sin acceso', async () => {
    currentUser = null;
    vi.mocked(api.villoOwnerAccess).mockRejectedValue(new VaiinillaApiError(404, { code: 'HTTP_ERROR', message: 'not found' }));
    render(<VilloPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'bimbose714@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Esta cuenta no tiene acceso a VILLO')).toBeInTheDocument();
  });

  it('cerrar sesión vuelve al formulario', async () => {
    render(<VilloPage />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument());
  });

  it('un error de acceso se muestra como sin acceso y sin datos', async () => {
    vi.mocked(api.villoOwnerAccess).mockRejectedValue(new Error('network'));
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta cuenta no tiene acceso a VILLO')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dispositivos' })).not.toBeInTheDocument();
  });

  it('pide TOTP cuando Firebase requiere el segundo factor', async () => {
    currentUser = null;
    vi.mocked(passwordSignIn).mockResolvedValue({ mfaResolver: { hints: [] } as never });
    render(<VilloPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByLabelText('Código de tu aplicación autenticadora')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Código de tu aplicación autenticadora'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar código' }));
    expect(await screen.findByRole('heading', { name: 'Guía técnica ESP32' })).toBeInTheDocument();
    expect(completeTotpSignIn).toHaveBeenCalledWith(expect.anything(), '123456');
  });

  it('la sesión persistente se reutiliza al volver a montar la página', async () => {
    const persistentUser = ownerUser();
    currentUser = persistentUser;
    const first = render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Guía técnica ESP32' })).toBeInTheDocument();
    first.unmount();
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Guía técnica ESP32' })).toBeInTheDocument();
    expect(api.villoOwnerAccess).toHaveBeenCalledWith('firebase-token');
  });
});
