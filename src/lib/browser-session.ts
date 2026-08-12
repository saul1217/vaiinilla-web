const SESSION_COOKIE = 'vaiinilla_browser_session';
const TENANT_MEMBERSHIP_COOKIE = 'vaiinilla_tenant_membership';
const COOKIE_PATH = '/';

function cookieAttributes(): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `Path=${COOKIE_PATH}; SameSite=Lax${secure}`;
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

function writeSessionCookie(name: string, value: string): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${cookieAttributes()}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${encodeURIComponent(name)}=; ${cookieAttributes()}; Max-Age=0`;
}

/**
 * Starts a browser-scoped session. The cookie intentionally has no Expires or
 * Max-Age attribute, so the browser discards it when its session ends.
 * It contains only a random marker; authentication tokens remain in memory.
 */
export function beginBrowserSession(): void {
  if (!readCookie(SESSION_COOKIE)) writeSessionCookie(SESSION_COOKIE, crypto.randomUUID());
}

export function hasBrowserSession(): boolean {
  return Boolean(readCookie(SESSION_COOKIE));
}

export function rememberTenantMembership(membershipId: string): void {
  beginBrowserSession();
  writeSessionCookie(TENANT_MEMBERSHIP_COOKIE, membershipId);
}

export function getRememberedTenantMembership(): string | null {
  return readCookie(TENANT_MEMBERSHIP_COOKIE);
}

export function forgetTenantMembership(): void {
  deleteCookie(TENANT_MEMBERSHIP_COOKIE);
}

export function endBrowserSession(): void {
  deleteCookie(TENANT_MEMBERSHIP_COOKIE);
  deleteCookie(SESSION_COOKIE);
}
