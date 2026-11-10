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
import { passwordSignIn } from '../lib/firebase';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VilloPage } from './villo-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const clearAll = vi.fn().mockResolvedValue(undefined);
let currentUser: { uid: string; getIdToken: () => Promise<string> } | null;

vi.mock('../lib/firebase', () => ({ passwordSignIn: vi.fn() }));
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter initialEntries={['/villo']}><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

const ownerUser = () => ({ uid: 'owner-uid', getIdToken: vi.fn().mockResolvedValue('firebase-token') });
const envelope = (markdown = '# Guía') => HttpResponse.json({ data: { markdown, actualizado_en: '2026-11-09T12:00:00Z' }, meta: {}, error: null });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.stubEnv('MODE', 'test');
  vi.stubEnv('VITE_VILLO_OWNER_SESION_NORMAL', 'true');
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
  vi.mocked(api.villoOwnerAccess).mockResolvedValue(undefined);
  server.use(
    http.get(`${baseUrl}/sesiones/accesos`, () => HttpResponse.json({ data: [], meta: {}, error: null })),
    http.get(`${baseUrl}/villo/owner/guia`, () => envelope()),
  );
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); server.resetHandlers(); });
afterAll(() => server.close());

describe('Sección privada /villo', () => {
  it('con gate apagado devuelve 404 sin formulario', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_VILLO_OWNER_SESION_NORMAL', 'false');
    currentUser = null;
    vi.mocked(api.villoOwnerAccess).mockRejectedValue(new VaiinillaApiError(404, { code: 'HTTP_ERROR', message: 'not found' }));
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
  });

  it('con gate encendido y sin sesión muestra el formulario propio', () => {
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
    expect(await screen.findByRole('heading', { name: 'Guía' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dispositivos' })).toBeInTheDocument();
    expect(vi.mocked(api.villoOwnerAccess)).toHaveBeenCalledWith('firebase-token');
    expect(passwordSignIn).toHaveBeenCalledWith('bimbose714@example.com', 'correct-horse-battery', true);
    expect(clearAll).toHaveBeenCalled();
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

  it('usa ID token Firebase cuando está habilitado para dev', async () => {
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Villo' })).toBeInTheDocument();
    expect(vi.mocked(api.villoOwnerAccess)).toHaveBeenCalledWith('firebase-token');
  });

  it('en producción solo usa la sesión de plataforma', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_VILLO_OWNER_SESION_NORMAL', 'false');
    const getIdToken = vi.fn().mockResolvedValue('firebase-token');
    currentUser = { uid: 'owner-uid', getIdToken };
    vi.mocked(api.villoOwnerAccess).mockResolvedValue(undefined);
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByRole('heading', { name: 'Villo' })).toBeInTheDocument();
    expect(vi.mocked(api.villoOwnerAccess)).toHaveBeenCalledWith('fixture');
    expect(getIdToken).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('con un error de acceso distinto de 404 mantiene la 404 estándar', async () => {
    vi.mocked(api.villoOwnerAccess).mockRejectedValue(new Error('network'));
    render(<VilloPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta ruta no existe.')).toBeInTheDocument();
  });
});
