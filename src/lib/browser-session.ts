const SESSION_COOKIE = 'vaiinilla_browser_session';
const TENANT_MEMBERSHIP_COOKIE = 'vaiinilla_tenant_membership';
const TENANT_MEMBERSHIP_WINDOW = 'vaiinilla_tenant_membership_window';
const COOKIE_PATH = '/';

/**
 * Roles que conservan la sesión al cerrar el navegador.
 *
 * Mesero y Cocina trabajan desde su propio teléfono y cerrar el navegador es parte
 * de su día: obligarlos a entrar de nuevo en cada aviso haría inútil la notificación.
 * Caja y Administración NO entran aquí a propósito: manejan dinero y configuración,
 * suelen usar un dispositivo compartido, y ahí la caducidad por navegador es la
 * protección de que el siguiente turno no herede la sesión del anterior.
 */
const ROLES_SESION_PERSISTENTE = new Set(['mesero', 'cocina']);

/** Siete días: cubre una semana de turnos sin volverse una sesión eterna. */
const DIAS_SESION_PERSISTENTE = 7;

export function rolConservaSesion(rol: string): boolean {
  return ROLES_SESION_PERSISTENTE.has(rol);
}

function cookieAttributes(maxAgeDays?: number): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  // Sin Max-Age la cookie es de sesión y el navegador la descarta al cerrarse.
  const maxAge = maxAgeDays ? `; Max-Age=${maxAgeDays * 24 * 60 * 60}` : '';
  return `Path=${COOKIE_PATH}; SameSite=Lax${secure}${maxAge}`;
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) return null;
  return decodeURIComponent(match.slice(prefix.length));
}

function writeSessionCookie(name: string, value: string, maxAgeDays?: number): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${cookieAttributes(maxAgeDays)}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${encodeURIComponent(name)}=; ${cookieAttributes()}; Max-Age=0`;
}

/**
 * Starts a browser-scoped session. The cookie intentionally has no Expires or
 * Max-Age attribute, so the browser discards it when its session ends.
 * It contains only a random marker; authentication tokens remain in memory.
 */
export function beginBrowserSession(maxAgeDays?: number): void {
  const actual = readCookie(SESSION_COOKIE);
  // Con Max-Age se reescribe aunque ya exista: así un acceso de Mesero convierte en
  // persistente la marca que nació como cookie de sesión al entrar a Firebase.
  if (!actual) writeSessionCookie(SESSION_COOKIE, crypto.randomUUID(), maxAgeDays);
  else if (maxAgeDays) writeSessionCookie(SESSION_COOKIE, actual, maxAgeDays);
}

export function hasBrowserSession(): boolean {
  return Boolean(readCookie(SESSION_COOKIE));
}

/**
 * Recuerda la membresía elegida. Con un rol que conserva sesión, reescribe ambas
 * cookies con Max-Age para que sobrevivan al cierre del navegador; `sessionStorage`
 * muere igual, y por eso `getRememberedTenantMembership` cae a la cookie.
 */
export function rememberTenantMembership(membershipId: string, rol?: string): void {
  const dias = rol && rolConservaSesion(rol) ? DIAS_SESION_PERSISTENTE : undefined;
  beginBrowserSession(dias);
  try {
    window.sessionStorage.setItem(TENANT_MEMBERSHIP_WINDOW, membershipId);
  } catch {
    // The session cookie remains the fallback when storage is unavailable.
  }
  writeSessionCookie(TENANT_MEMBERSHIP_COOKIE, membershipId, dias);
}

export function getRememberedTenantMembership(): string | null {
  try {
    const windowMembership = window.sessionStorage.getItem(TENANT_MEMBERSHIP_WINDOW);
    if (windowMembership) return windowMembership;
  } catch {
    // Fall through to the browser-session cookie.
  }
  return readCookie(TENANT_MEMBERSHIP_COOKIE);
}

export function forgetTenantMembership(): void {
  try {
    window.sessionStorage.removeItem(TENANT_MEMBERSHIP_WINDOW);
  } catch {
    // The cookie still gets removed below.
  }
  deleteCookie(TENANT_MEMBERSHIP_COOKIE);
}

export function endBrowserSession(): void {
  forgetTenantMembership();
  deleteCookie(SESSION_COOKIE);
}
