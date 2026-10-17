import { afterEach, describe, expect, it } from 'vitest';
import {
  beginBrowserSession,
  endBrowserSession,
  forgetTenantMembership,
  getRememberedTenantMembership,
  hasBrowserSession,
  rememberTenantMembership,
  rolConservaSesion,
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

  it('Mesero y Cocina conservan la sesión al cerrar el navegador; Caja y Administración no', () => {
    expect(rolConservaSesion('mesero')).toBe(true);
    expect(rolConservaSesion('cocina')).toBe(true);
    expect(rolConservaSesion('cajero')).toBe(false);
    expect(rolConservaSesion('admin')).toBe(false);
    expect(rolConservaSesion('cliente')).toBe(false);
  });

  it('con rol de Mesero la cookie lleva Max-Age y deja de morir con el navegador', () => {
    // jsdom no expone los atributos al leer document.cookie, así que se intercepta
    // la escritura: es la única forma de comprobar que Max-Age va en la cookie.
    const escrituras: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => original.get!.call(document) as string,
      set: (valor: string) => {
        escrituras.push(valor);
        original.set!.call(document, valor);
      },
    });

    try {
      rememberTenantMembership('membresia-mesero', 'mesero');
      expect(escrituras.every((cookie) => cookie.includes('Max-Age='))).toBe(true);

      escrituras.length = 0;
      endBrowserSession();
      rememberTenantMembership('membresia-caja', 'cajero');
      // Caja: ninguna cookie de sesión con Max-Age, salvo el borrado previo.
      const nuevas = escrituras.filter((cookie) => !cookie.includes('Max-Age=0'));
      expect(nuevas.length).toBeGreaterThan(0);
      expect(nuevas.some((cookie) => cookie.includes('Max-Age='))).toBe(false);
    } finally {
      Object.defineProperty(document, 'cookie', original);
    }
  });

  it('elimina toda la referencia local al cerrar sesión', () => {
    rememberTenantMembership('membresia-123');
    endBrowserSession();

    expect(hasBrowserSession()).toBe(false);
    expect(getRememberedTenantMembership()).toBeNull();
  });
});
