import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { AuthPage } from './auth-page';

const mocks = vi.hoisted(() => ({
  passwordSignIn: vi.fn(),
  completeTotpSignIn: vi.fn(),
  signOut: vi.fn(),
  openPlatformSession: vi.fn(),
  requestEmailVerification: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  getLegalVersions: vi.fn(),
}));

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: null,
    ready: true,
    configured: true,
    signOut: mocks.signOut,
  }),
}));

vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: null,
    tenantReady: true,
    platform: null,
    openPlatformSession: mocks.openPlatformSession,
  }),
}));

vi.mock('../lib/firebase', () => ({
  passwordSignIn: mocks.passwordSignIn,
  completeTotpSignIn: mocks.completeTotpSignIn,
  beginTotpEnrollment: vi.fn(),
  completeTotpEnrollment: vi.fn(),
  firebaseSignOut: vi.fn(),
  hasTotpEnrollment: vi.fn(() => false),
  updateFirebaseDisplayName: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    requestEmailVerification: mocks.requestEmailVerification,
    requestPasswordRecovery: mocks.requestPasswordRecovery,
    getLegalVersions: mocks.getLegalVersions,
    registerIdentity: vi.fn(),
  },
}));

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));

describe('preparación de una cuenta de plataforma existente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLegalVersions.mockResolvedValue({
      terminos_version: '2026-07',
      terminos_url: 'https://app.vaiinilla.app/legal/terminos/2026-07',
      privacidad_version: '2026-07',
      privacidad_url: 'https://app.vaiinilla.app/legal/privacidad/2026-07',
    });
  });

  it('no solicita contexto ni concede autoridad antes de verificar correo y TOTP', async () => {
    const firebaseUser = {
      email: 'cloya704@gmail.com',
      emailVerified: false,
      displayName: null,
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      reload: vi.fn(),
    } as unknown as User;
    mocks.passwordSignIn.mockResolvedValue({ user: firebaseUser });
    mocks.requestEmailVerification.mockResolvedValue(undefined);

    const actor = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/plataforma/acceso']}>
        <AuthPage surface="platform" />
      </MemoryRouter>,
    );

    await actor.type(screen.getByLabelText('Correo'), 'cloya704@gmail.com');
    await actor.type(screen.getByLabelText('Contraseña'), 'contraseña-segura');
    await actor.click(screen.getByRole('button', { name: 'Continuar con segundo factor' }));

    expect(await screen.findByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
    expect(screen.getByText('Preparación de cuenta existente')).toBeVisible();
    expect(mocks.openPlatformSession).not.toHaveBeenCalled();

    await actor.click(screen.getByRole('button', { name: 'Enviar correo de verificación' }));
    expect(mocks.requestEmailVerification).toHaveBeenCalledWith('firebase-token');
    expect(await screen.findByText(/Enviamos el enlace de verificación/)).toBeVisible();
    expect(mocks.openPlatformSession).not.toHaveBeenCalled();
  });
});
