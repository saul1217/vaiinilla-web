import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { SessionAccess, TenantContextResponse } from '../types/api';
import { endBrowserSession, getRememberedTenantMembership } from '../lib/browser-session';
import { SessionProvider, useSessions } from './session-context';

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  listAccesses: vi.fn(),
  createTenantContext: vi.fn(),
  createPlatformContext: vi.fn(),
}));

vi.mock('./auth-context', () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
  }),
}));

vi.mock('../lib/api', () => ({
  api: {
    listAccesses: mocks.listAccesses,
    createTenantContext: mocks.createTenantContext,
    createPlatformContext: mocks.createPlatformContext,
  },
}));

const access: SessionAccess = {
  membresia_id: 'membresia-123',
  establecimiento: { id: 'establecimiento-1', nombre: 'Caffenio', slug: 'caffenio' },
  rol: 'cajero',
  identificador_cliente: null,
  estado_establecimiento: 'activo',
  cierre_operativo_disponible: false,
};

function contextResponse(token: string): TenantContextResponse {
  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 900,
    contexto: {
      usuario_id: 'usuario-1',
      membresia_id: access.membresia_id,
      establecimiento_id: access.establecimiento.id,
      rol: access.rol,
      modo_restringido: null,
    },
  };
}

function Probe() {
  const { tenant, tenantReady, openTenantSession } = useSessions();
  return (
    <div>
      <span>{tenantReady ? 'lista' : 'recuperando'}</span>
      <span>{tenant?.token ?? 'sin-contexto'}</span>
      <button type="button" onClick={() => void openTenantSession(mocks.user!, access)}>
        Abrir acceso
      </button>
    </div>
  );
}

describe('SessionProvider para trabajadores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    endBrowserSession();
    mocks.user = {
      uid: 'firebase-uid-1',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
    } as unknown as User;
  });

  afterEach(() => endBrowserSession());

  it('recupera el contexto en otra ventana sin guardar el JWT en la cookie', async () => {
    mocks.listAccesses.mockResolvedValue([access]);
    mocks.createTenantContext
      .mockResolvedValueOnce(contextResponse('jwt-ventana-1'))
      .mockResolvedValueOnce(contextResponse('jwt-ventana-2'));

    const firstWindow = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await screen.findByText('lista');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir acceso' }));
    expect(await screen.findByText('jwt-ventana-1')).toBeVisible();
    expect(getRememberedTenantMembership()).toBe(access.membresia_id);
    expect(document.cookie).not.toContain('jwt-ventana-1');

    firstWindow.unmount();
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(await screen.findByText('jwt-ventana-2')).toBeVisible();
    await waitFor(() => expect(mocks.listAccesses).toHaveBeenCalledWith('firebase-token'));
    expect(mocks.createTenantContext).toHaveBeenLastCalledWith(
      'firebase-token',
      access.membresia_id,
    );
  });
});
