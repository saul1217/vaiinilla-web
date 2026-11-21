const STORAGE_KEY = 'vaiinilla.pending-invitation';
// Un día: quien crea su cuenta puede verificar el correo más tarde. La invitación vence en el back.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredInvitation {
  token: string;
  savedAt: number;
}

// localStorage y no sessionStorage: el enlace para verificar el correo abre otra pestaña, y con
// sessionStorage la invitación se quedaba en la primera. Ahí la persona ya tenía cuenta en Firebase
// sin registro ni términos, y al volver a «Crear cuenta» le salía que la cuenta ya existe.
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredInvitation(value: unknown): value is StoredInvitation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredInvitation>;
  return typeof candidate.token === 'string' && typeof candidate.savedAt === 'number';
}

export function savePendingInvitation(token: string, now = Date.now()): void {
  const cleanToken = token.trim();
  if (!cleanToken) return;
  storage()?.setItem(STORAGE_KEY, JSON.stringify({ token: cleanToken, savedAt: now }));
}

export function readPendingInvitation(now = Date.now()): string | null {
  const pendingStorage = storage();
  const raw = pendingStorage?.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isStoredInvitation(parsed) ||
      parsed.token.trim() === '' ||
      now - parsed.savedAt > TOKEN_TTL_MS ||
      parsed.savedAt > now + 60_000
    ) {
      pendingStorage?.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    pendingStorage?.removeItem(STORAGE_KEY);
    return null;
  }
}

export function capturePendingInvitationFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token')?.trim() || null;

  if (token) savePendingInvitation(token);

  if (url.search) {
    window.history.replaceState(window.history.state, '', url.pathname + url.hash);
  }

  return token ?? readPendingInvitation();
}

export function clearPendingInvitation(): void {
  storage()?.removeItem(STORAGE_KEY);
}

export const pendingInvitationTtlMs = TOKEN_TTL_MS;
