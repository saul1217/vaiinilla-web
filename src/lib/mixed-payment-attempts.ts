// Intentos de pago mixto guardados en el navegador para reintentar con la misma
// Idempotency-Key si se pierde la respuesta. El backend guarda la llave por
// negocio y usuario (idempotencias_api), así que un intento solo se puede
// reenviar con un token del mismo backend, negocio y usuario que lo creó: con
// otro usuario o negocio la llave no existe allá y se cobraría de nuevo.

export type MixedPaymentMethod = 'efectivo' | 'terminal';

/** Dueño de un intento: backend (entorno), negocio y usuario de la sesión. */
export interface MixedPaymentScope {
  apiUrl: string;
  establecimientoId: string;
  usuarioId: string;
}

export interface MixedPaymentAttempt {
  version: 2;
  scope: MixedPaymentScope;
  orderId: string;
  idempotencyKey: string;
  body: { metodo_pago: MixedPaymentMethod; monto: string; monto_recibido?: string };
  /** Saldo mostrado al iniciar el intento. */
  expectedRemaining: string;
  /** Presente cuando el servidor confirmó el intento. */
  completedRemaining?: string;
  /** Epoch ms de creación; los intentos viejos se descartan. */
  createdAt: number;
}

const prefix = 'vaiinilla:mixed-payment:v2:';
/** Pasado este tiempo el intento ya no se reintenta: manda el saldo que diga el servidor. */
export const MIXED_PAYMENT_ATTEMPT_TTL_MS = 12 * 60 * 60 * 1000;

const MONEY = /^\d+\.\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scopePrefix(scope: MixedPaymentScope): string {
  return `${prefix}${encodeURIComponent(scope.apiUrl)}|${encodeURIComponent(scope.establecimientoId)}|${encodeURIComponent(scope.usuarioId)}|`;
}

export function isCompleteScope(scope: Partial<MixedPaymentScope> | null | undefined): scope is MixedPaymentScope {
  return Boolean(scope?.apiUrl && scope.establecimientoId && scope.usuarioId);
}

export function mixedPaymentStorageKey(scope: MixedPaymentScope, orderId: string): string {
  return `${scopePrefix(scope)}${encodeURIComponent(orderId)}`;
}

/** Marca en sessionStorage de que el backend de este dueño no tiene el endpoint (404). */
export function mixedPaymentUnavailableKey(scope: MixedPaymentScope): string {
  return `vaiinilla:mixed-payment-unavailable:${scopePrefix(scope).slice(prefix.length)}`;
}

/** Nombre del candado entre pestañas: uno por dueño y pedido. */
export function mixedPaymentLockName(scope: MixedPaymentScope, orderId: string): string {
  return mixedPaymentStorageKey(scope, orderId);
}

function sameScope(a: MixedPaymentScope, b: MixedPaymentScope): boolean {
  return a.apiUrl === b.apiUrl && a.establecimientoId === b.establecimientoId && a.usuarioId === b.usuarioId;
}

function isAttempt(value: unknown): value is MixedPaymentAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<MixedPaymentAttempt>;
  const body = attempt.body;
  return attempt.version === 2
    && isCompleteScope(attempt.scope)
    && typeof attempt.orderId === 'string'
    && typeof attempt.idempotencyKey === 'string' && UUID.test(attempt.idempotencyKey)
    && typeof attempt.expectedRemaining === 'string' && MONEY.test(attempt.expectedRemaining)
    && (attempt.completedRemaining === undefined || (typeof attempt.completedRemaining === 'string' && MONEY.test(attempt.completedRemaining)))
    && typeof attempt.createdAt === 'number'
    && Boolean(body) && typeof body === 'object'
    && (body.metodo_pago === 'efectivo' || body.metodo_pago === 'terminal')
    && typeof body.monto === 'string' && MONEY.test(body.monto)
    && (body.monto_recibido === undefined || (typeof body.monto_recibido === 'string' && MONEY.test(body.monto_recibido)));
}

/**
 * Lee el intento del pedido para este dueño. Si lo guardado no es válido, no es
 * de este dueño o de este pedido, o ya venció, se borra y devuelve null.
 */
export function readMixedPaymentAttempt(scope: MixedPaymentScope, orderId: string, now = Date.now()): MixedPaymentAttempt | null {
  const key = mixedPaymentStorageKey(scope, orderId);
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    parsed = null;
  }
  if (!isAttempt(parsed) || !sameScope(parsed.scope, scope) || parsed.orderId !== orderId
    || now - parsed.createdAt > MIXED_PAYMENT_ATTEMPT_TTL_MS || parsed.createdAt - now > MIXED_PAYMENT_ATTEMPT_TTL_MS) {
    clearMixedPaymentAttempt(scope, orderId);
    return null;
  }
  return parsed;
}

export function writeMixedPaymentAttempt(attempt: MixedPaymentAttempt): void {
  window.localStorage.setItem(mixedPaymentStorageKey(attempt.scope, attempt.orderId), JSON.stringify(attempt));
}

export function clearMixedPaymentAttempt(scope: MixedPaymentScope, orderId: string): void {
  try {
    window.localStorage.removeItem(mixedPaymentStorageKey(scope, orderId));
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Intentos sin confirmar de este dueño. Los de otros usuarios, negocios o entornos ni se leen. */
export function listPendingMixedPaymentAttempts(scope: MixedPaymentScope, now = Date.now()): MixedPaymentAttempt[] {
  const ownPrefix = scopePrefix(scope);
  const orderIds: string[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(ownPrefix)) orderIds.push(decodeURIComponent(key.slice(ownPrefix.length)));
    }
  } catch {
    return [];
  }
  return orderIds
    .map((orderId) => readMixedPaymentAttempt(scope, orderId, now))
    .filter((attempt): attempt is MixedPaymentAttempt => attempt !== null && attempt.completedRemaining === undefined);
}
