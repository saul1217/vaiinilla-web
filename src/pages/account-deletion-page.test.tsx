import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionPage } from './account-deletion-page';

const mocks = vi.hoisted(() => ({
  passwordSignIn: vi.fn(),
  completeTotpSignIn: vi.fn(),
  deleteOwnAccount: vi.fn(),
  getIdToken: vi.fn(),
  signOut: vi.fn(),
  clearAll: vi.fn(),
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
  useSessions: () => ({ clearAll: mocks.clearAll }),
}));

vi.mock('../lib/firebase', () => ({
  passwordSignIn: mocks.passwordSignIn,
  completeTotpSignIn: mocks.completeTotpSignIn,
}));

vi.mock('../lib/api', () => ({
  api: { deleteOwnAccount: mocks.deleteOwnAccount },
}));

function firebaseUser(): User {
  mocks.getIdToken.mockResolvedValue('firebase-token-reciente');
  return {
    email: 'cliente@vaiinilla.test',
    getIdToken: mocks.getIdToken,
  } as unknown as User;
}

async function reachConfirmation(actor: ReturnType<typeof userEvent.setup>, user: User) {
  mocks.passwordSignIn.mockResolvedValue({ user });
  render(
    <MemoryRouter initialEntries={['/eliminar-cuenta']}>
      <AccountDeletionPage />
    </MemoryRouter>,
  );

  await actor.type(screen.getByLabelText('Correo de la cuenta'), 'cliente@vaiinilla.test');
  await actor.type(screen.getByLabelText('Contraseña'), 'test1234');
  await actor.click(screen.getByRole('button', { name: 'Confirmar identidad' }));
  expect(await screen.findByRole('heading', { name: 'Revisa antes de eliminar' })).toBeVisible();
}

describe('eliminación Web de cuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.deleteOwnAccount.mockResolvedValue({
      solicitud_id: '8a79bc4b-ffb9-44d1-a4a2-92dd8af08ef4',
      estado: 'eliminada',
      eliminada_en: '2026-08-18T12:00:00.000Z',
    });
  });

  it('rea autentica, exige doble confirmación y cierra toda la sesión tras el éxito', async () => {
    const actor = userEvent.setup();
    const user = firebaseUser();
    await reachConfirmation(actor, user);

    const deleteButton = screen.getByRole('button', { name: 'Eliminar mi cuenta definitivamente' });
    expect(deleteButton).toBeDisabled();

    await actor.type(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'ELIMINAR');
    expect(deleteButton).toBeDisabled();
    await actor.click(screen.getByRole('checkbox', { name: /Entiendo que esta acción es definitiva/ }));
    expect(deleteButton).toBeEnabled();
    await actor.click(deleteButton);

    expect(mocks.passwordSignIn).toHaveBeenCalledWith(
      'cliente@vaiinilla.test',
      'test1234',
      true,
    );
    expect(mocks.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.deleteOwnAccount).toHaveBeenCalledWith(
      'firebase-token-reciente',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(mocks.clearAll).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Cuenta eliminada' })).toBeVisible();
    expect(screen.getByText(/cliente@vaiinilla\.test/)).toBeVisible();
  });

  it('reutiliza la misma llave al reintentar un fallo temporal', async () => {
    const actor = userEvent.setup();
    await reachConfirmation(actor, firebaseUser());
    mocks.deleteOwnAccount
      .mockRejectedValueOnce(new Error('No fue posible completar la eliminación.'))
      .mockResolvedValueOnce({
        solicitud_id: '8a79bc4b-ffb9-44d1-a4a2-92dd8af08ef4',
        estado: 'eliminada',
        eliminada_en: '2026-08-18T12:00:00.000Z',
      });

    await actor.type(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'ELIMINAR');
    await actor.click(screen.getByRole('checkbox', { name: /Entiendo que esta acción es definitiva/ }));
    const deleteButton = screen.getByRole('button', { name: 'Eliminar mi cuenta definitivamente' });
    await actor.click(deleteButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible completar la eliminación.');
    await actor.click(deleteButton);

    expect(mocks.deleteOwnAccount).toHaveBeenCalledTimes(2);
    expect(mocks.deleteOwnAccount.mock.calls[0]?.[1]).toBe(
      mocks.deleteOwnAccount.mock.calls[1]?.[1],
    );
    expect(await screen.findByRole('heading', { name: 'Cuenta eliminada' })).toBeVisible();
  });
});
