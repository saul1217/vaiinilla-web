import { VaiinillaApiError, errorMessage } from './api-error';
import { MONEY_PATTERN, formatMoney, moneyToCents } from './money';
import type { WalletClient, WalletClientMovement } from '../types/api';

/*
 * Reglas de saldo y recarga en efectivo desde Caja, las mismas que la app de Android
 * (vaiinilla-android ui/screens/WalletReloadSheet.kt, WalletMovements.kt y
 * data/wallet/PendingWalletReloadStore.kt), contra los endpoints de vaiinilla_back
 * src/routes/wallet.routes.js.
 */

/** Claves de caché por negocio: los clientes y saldos de una tienda no se ven en otra. */
export const walletKeys = (storeId: string) => ({
  search: (query: string) => ['wallet-caja', storeId, 'clientes', query] as const,
  detail: (userId: string) => ['wallet-caja', storeId, 'cliente', userId] as const,
  all: ['wallet-caja', storeId] as const,
});

// region Búsqueda

/** El servidor pide `q` de 2 a 80 letras (wallet.controller buscarClientes). */
export const WALLET_SEARCH_MIN = 2;
export const WALLET_SEARCH_MAX = 80;
/** Espera tras la última tecla antes de buscar, como Android (ReloadSearchDebounceMs). */
export const WALLET_SEARCH_DEBOUNCE_MS = 350;

/** El texto a buscar ya recortado, o null si todavía no alcanza para buscar. */
export function searchQuery(text: string): string | null {
  const query = text.trim();
  return query.length >= WALLET_SEARCH_MIN && query.length <= WALLET_SEARCH_MAX ? query : null;
}

const BUSINESS_TIME_ZONE = 'America/Mexico_City';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortDay = new Intl.DateTimeFormat('es-MX', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short' });

function businessDay(date: Date): string {
  return dayFormat.format(date);
}

/** «Pidió hoy», «Pidió ayer» o «Pidió el 28 oct», con el día del negocio; null si nunca ha pedido. */
export function lastOrderLabel(lastOrderAt: string | null, now: Date = new Date()): string | null {
  if (!lastOrderAt) return null;
  const at = new Date(lastOrderAt);
  if (Number.isNaN(at.getTime())) return null;
  const day = businessDay(at);
  if (day === businessDay(now)) return 'Pidió hoy';
  if (day === businessDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Pidió ayer';
  return `Pidió el ${shortDay.format(at).replace(/\./g, '')}`;
}

/** Bajo el nombre: identificador, correo enmascarado y último pedido, para no recargarle al homónimo. */
export function clientDetail(client: WalletClient, now: Date = new Date()): string | null {
  const parts = [client.identificador_cliente, client.correo_enmascarado, lastOrderLabel(client.ultimo_pedido_en, now)]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

// endregion

// region Monto

/** Billetes con los que suele recargar la gente (ReloadQuickAmounts de Android). */
export const QUICK_AMOUNTS = ['50', '100', '200', '500'] as const;

/** Lo que el servidor acepta: hasta 8 enteros y 2 decimales (utils/validation MONTO_RE). */
const MAX_INTEGER_DIGITS = 8;

/** El monto escrito como "100.00", o null si no es un monto positivo que acepte el servidor. */
export function rechargeAmount(text: string): string | null {
  const clean = text.trim();
  if (!MONEY_PATTERN.test(clean)) return null;
  const [pesos = '', centavos = ''] = clean.split('.');
  if (pesos.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS) return null;
  const cents = moneyToCents(clean);
  if (cents === null || cents <= 0n) return null;
  return `${BigInt(pesos)}.${centavos.padEnd(2, '0')}`;
}

/** «Recargar $100.00 MXN en efectivo»: a quién va lo dice la tarjeta del cliente, cuánto lo repite el botón. */
export function rechargeLabel(amount: string | null): string {
  return amount ? `Recargar ${formatMoney(amount)} en efectivo` : 'Recargar en efectivo';
}

// endregion

// region Movimientos

/** «+$100.00 MXN» o «−$45.00 MXN»; el signo lo trae `monto` desde el servidor. */
export function movementAmountLabel(amount: string): string {
  const debit = amount.trim().startsWith('-');
  const value = amount.trim().replace(/^[-+]/, '');
  return `${debit ? '−' : '+'}${formatMoney(value)}`;
}

export function isDebit(movement: WalletClientMovement): boolean {
  return movement.monto.trim().startsWith('-');
}

/** «Pedido #128 · Mesa 4 · Café, Pan»: de dónde salió un movimiento ligado a un pedido. */
export function movementDetail(movement: WalletClientMovement): string | null {
  const parts = [
    movement.pedido_folio !== null && movement.pedido_folio !== undefined ? `Pedido #${movement.pedido_folio}` : null,
    movement.lugar,
    movement.resumen_productos,
  ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

const movementTime = new Intl.DateTimeFormat('es-MX', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });

export function movementDate(createdAt: string): string {
  const at = new Date(createdAt);
  return Number.isNaN(at.getTime()) ? '' : movementTime.format(at);
}

// endregion

// region Permisos y errores

/** El back solo deja recargar al cajero (requireRole('cajero')); admin consulta. */
export function canRecharge(role: string | undefined): boolean {
  return role === 'cajero';
}

/** Mensaje para el cajero cuando la recarga no entra. */
export function rechargeErrorMessage(error: unknown): string {
  if (error instanceof VaiinillaApiError) {
    switch (error.code) {
      case 'CASH_REGISTER_CLOSED':
        return 'No hay una sesión de Caja abierta. Abre Caja antes de recargar.';
      case 'BALANCE_RECHARGE_NOT_ALLOWED':
        return 'Este negocio no tiene habilitadas las recargas de saldo.';
      case 'USER_NOT_FOUND':
        return 'Ese cliente ya no está disponible en este negocio.';
      case 'FORBIDDEN_ROLE':
        return 'Solo Caja puede recargar saldo.';
      case 'IDEMPOTENCY_KEY_REUSED':
        return 'La recarga sigue en proceso o ya se mandó con otros datos. Revisa el saldo antes de volver a cobrar.';
    }
  }
  if (!(error instanceof VaiinillaApiError)) {
    return 'No hubo respuesta del servidor. No sabemos si la recarga entró: reinténtala con el mismo botón, no se cobra dos veces.';
  }
  return errorMessage(error);
}

/**
 * Si la recarga quedó en duda (sin respuesta, 5xx o 409 de una llave en proceso) se conserva la
 * llave para reintentar sin abonar dos veces. Un 400, 403, 404 o 422 dice que no se aplicó.
 */
export function keepPendingAfter(error: unknown): boolean {
  if (!(error instanceof VaiinillaApiError)) return true;
  return ![400, 401, 403, 404, 422].includes(error.status);
}

// endregion

// region Recarga pendiente

/**
 * Una recarga confirmada se guarda aquí ANTES del POST, con su Idempotency-Key, como
 * PendingWalletReloadStore de Android. Si se pierde la respuesta o se cierra la pestaña, el
 * siguiente intento reusa la llave y el servidor responde la misma recarga en vez de abonar dos
 * veces. La llave del back vale por negocio y usuario, así que el registro también.
 */
export interface PendingRecharge {
  version: 1;
  userId: string;
  userName: string | null;
  amount: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface PendingRechargeScope {
  apiUrl: string;
  establecimientoId: string;
  usuarioId: string;
}

const PENDING_PREFIX = 'vaiinilla:wallet-recharge:v1:';
/** Pasado este tiempo se descarta: manda el saldo que diga el servidor. */
export const PENDING_RECHARGE_TTL_MS = 12 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pendingRechargeKey(scope: PendingRechargeScope): string {
  return `${PENDING_PREFIX}${[scope.apiUrl, scope.establecimientoId, scope.usuarioId].map(encodeURIComponent).join('|')}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPendingRecharge(scope: PendingRechargeScope, now: number = Date.now()): PendingRecharge | null {
  const store = storage();
  if (!store) return null;
  const key = pendingRechargeKey(scope);
  let parsed: unknown;
  try {
    parsed = JSON.parse(store.getItem(key) ?? 'null');
  } catch {
    parsed = null;
  }
  const record = parsed as Partial<PendingRecharge> | null;
  const valid =
    record?.version === 1 &&
    typeof record.userId === 'string' &&
    record.userId !== '' &&
    typeof record.amount === 'string' &&
    rechargeAmount(record.amount) === record.amount &&
    typeof record.idempotencyKey === 'string' &&
    UUID.test(record.idempotencyKey) &&
    typeof record.createdAt === 'number' &&
    now - record.createdAt < PENDING_RECHARGE_TTL_MS;
  if (!valid) {
    if (parsed !== null) store.removeItem(key);
    return null;
  }
  return { ...(record as PendingRecharge), userName: typeof record.userName === 'string' ? record.userName : null };
}

export function writePendingRecharge(scope: PendingRechargeScope, record: PendingRecharge): void {
  storage()?.setItem(pendingRechargeKey(scope), JSON.stringify(record));
}

export function clearPendingRecharge(scope: PendingRechargeScope): void {
  storage()?.removeItem(pendingRechargeKey(scope));
}

// endregion
