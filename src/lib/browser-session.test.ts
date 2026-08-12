import { afterEach, describe, expect, it } from 'vitest';
import {
  beginBrowserSession,
  endBrowserSession,
  forgetTenantMembership,
  getRememberedTenantMembership,
  hasBrowserSession,
  rememberTenantMembership,
} from './browser-session';

describe('browser-session', () => {
  afterEach(() => endBrowserSession());

  it('mantiene una marca de navegador y la membresía seleccionada por ventana', () => {
    beginBrowserSession();
    rememberTenantMembership('membresia-123');

    expect(hasBrowserSession()).toBe(true);
    expect(getRememberedTenantMembership()).toBe('membresia-123');
    expect(document.cookie).not.toContain('token');
  });

  it('conserva el rol de esta ventana aunque otra cambie la membresía por defecto', () => {
    rememberTenantMembership('membresia-caja');

    document.cookie = 'vaiinilla_tenant_membership=membresia-cocina; Path=/; SameSite=Lax';

    expect(getRememberedTenantMembership()).toBe('membresia-caja');

    window.sessionStorage.removeItem('vaiinilla_tenant_membership_window');
    expect(getRememberedTenantMembership()).toBe('membresia-cocina');
  });

  it('permite cambiar de acceso sin conservar la membresía anterior', () => {
    rememberTenantMembership('membresia-anterior');
    rememberTenantMembership('membresia-nueva');

    expect(getRememberedTenantMembership()).toBe('membresia-nueva');

    forgetTenantMembership();
    expect(getRememberedTenantMembership()).toBeNull();
    expect(hasBrowserSession()).toBe(true);
  });

  it('elimina toda la referencia local al cerrar sesión', () => {
    rememberTenantMembership('membresia-123');
    endBrowserSession();

    expect(hasBrowserSession()).toBe(false);
    expect(getRememberedTenantMembership()).toBeNull();
  });
});
