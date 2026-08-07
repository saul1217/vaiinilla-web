const STORAGE_KEY = 'vaiinilla.pending-invitation';
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

interface StoredInvitation {
  token: string;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
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
