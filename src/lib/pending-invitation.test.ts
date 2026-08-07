import { beforeEach, describe, expect, it } from 'vitest';
import {
  capturePendingInvitationFromUrl,
  clearPendingInvitation,
  pendingInvitationTtlMs,
  readPendingInvitation,
  savePendingInvitation,
} from './pending-invitation';

describe('invitación pendiente', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/invitaciones/aceptar');
  });

  it('captura el token y lo retira de la URL', () => {
    window.history.replaceState({}, '', '/invitaciones/aceptar?token=token-privado');

    expect(capturePendingInvitationFromUrl()).toBe('token-privado');
    expect(window.location.pathname).toBe('/invitaciones/aceptar');
    expect(window.location.search).toBe('');
    expect(readPendingInvitation()).toBe('token-privado');
  });

  it('conserva el token en la misma pestaña durante el alta', () => {
    savePendingInvitation('token-privado', 1_000);
    expect(readPendingInvitation(1_000 + pendingInvitationTtlMs - 1)).toBe('token-privado');
  });

  it('elimina tokens vencidos o al finalizar', () => {
    savePendingInvitation('token-vencido', 1_000);
    expect(readPendingInvitation(1_000 + pendingInvitationTtlMs + 1)).toBeNull();

    savePendingInvitation('token-activo');
    clearPendingInvitation();
    expect(readPendingInvitation()).toBeNull();
  });
});
