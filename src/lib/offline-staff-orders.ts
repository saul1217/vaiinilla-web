// Mesero y Caja sin internet (fase 1). Es la misma cola que usa Android
// (vaiinilla-android: domain/offline/OfflineStaffOrders.kt y ui/operational/OfflineStaffOrderQueue.kt):
// un pedido en efectivo que no se pudo mandar se guarda en el navegador ANTES de cualquier
// reintento, con su propio id, su folio local y la llave del intento con red que falló. Se
// manda en orden cuando vuelve la red o cada 30 segundos, siempre con la misma llave: si el
// primer intento sí llegó, el servidor no lo registra dos veces.
//
// Lo guardado nunca incluye el token de la sesión: el token se pide al momento de mandar.
// Cada cola es de un negocio, un usuario y un entorno (la URL del backend): otra sesión en el
// mismo navegador no ve ni manda los pedidos de la anterior.
import { VaiinillaApiError } from './api-error';
import type { StaffOrderInput, StaffOrderResult } from '../types/api';

const STORAGE_VERSION = 'v1';
const PREFIX = `vaiinilla:${STORAGE_VERSION}`;

/** El servidor deja de aceptarlos a las 12 h (`OFFLINE_ORDER_TOO_OLD`); aquí se avisa antes. */
export const MAXIMUM_AGE_MS = 12 * 60 * 60 * 1000;
/** Mientras haya pendientes, aunque la red parezca bien (el servidor puede estar caído). */
export const RETRY_INTERVAL_MS = 30_000;
/** Tras tantos 5xx seguidos con el mismo pedido se aparta para no atorar a los de atrás. */
export const MAXIMUM_SERVER_FAILURES = 3;

export const TOO_OLD_PROBLEM = 'Pasaron más de 12 horas sin conexión. Regístralo a mano.';
export const SERVER_FAILURE_PROBLEM = 'El servidor falló varias veces con este pedido. Toca Reintentar o regístralo a mano.';
export const STORAGE_UNAVAILABLE_MESSAGE =
  'Este navegador no deja guardar pedidos sin conexión (modo privado o almacenamiento lleno). ' +
  'No se pueden tomar pedidos sin internet aquí: regístralos a mano hasta que vuelva la red.';

/** De quién es la cola: un usuario, en un negocio, contra un backend. */
export interface OfflineStaffScope {
  env: string;
  establecimientoId: string;
  usuarioId: string;
}

export function scopeId(scope: OfflineStaffScope): string {
  return `${scope.env}|${scope.establecimientoId}|${scope.usuarioId}`;
}

/** El entorno es el host del backend: dev y producción no comparten cola ni borrador. */
export function environmentOf(apiUrl: string): string {
  try {
    return new URL(apiUrl).host || apiUrl;
  } catch {
    return apiUrl;
  }
}

export function queueStorageKey(scope: OfflineStaffScope): string {
  return `${PREFIX}:offline-staff-orders:${scopeId(scope)}`;
}

export function draftStorageKey(scope: OfflineStaffScope): string {
  return `${PREFIX}:staff-order-draft:${scopeId(scope)}`;
}

const DEVICE_TAG_KEY = `${PREFIX}:device-tag`;

/** El almacenamiento durable falló: no se sigue en memoria sin avisar, porque se perdería la llave. */
export class DurableStorageError extends Error {
  constructor(cause?: unknown) {
    super(STORAGE_UNAVAILABLE_MESSAGE);
    this.name = 'DurableStorageError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface DurableStore {
  read(key: string): string | null;
  /** Escribe y comprueba que quedó; si no, lanza DurableStorageError. */
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** Con cookies bloqueadas, solo leer `localStorage` lanza SecurityError: se trata como no disponible. */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** localStorage con verificación: cualquier falla se reporta, nunca se ignora. */
export function browserDurableStore(storage: Storage | null = defaultStorage()): DurableStore {
  return {
    read(key) {
      if (!storage) throw new DurableStorageError();
      try {
        return storage.getItem(key);
      } catch (error) {
        throw new DurableStorageError(error);
      }
    },
    write(key, value) {
      if (!storage) throw new DurableStorageError();
      try {
        storage.setItem(key, value);
        if (storage.getItem(key) !== value) throw new Error('El valor guardado no coincide.');
      } catch (error) {
        throw new DurableStorageError(error);
      }
    },
    remove(key) {
      if (!storage) throw new DurableStorageError();
      try {
        storage.removeItem(key);
      } catch (error) {
        throw new DurableStorageError(error);
      }
    },
  };
}

export interface OfflineStaffOrder {
  /** Id del pedido, generado aquí; el servidor lo respeta (migración 161). */
  id: string;
  idempotencyKey: string;
  /** Folio provisional, p. ej. «C123-004». */
  localFolio: string;
  /** Cuerpo de POST /pedidos ya con `sin_conexion`; se manda tal cual. */
  body: StaffOrderInput;
  placeLabel: string;
  summary: string;
  capturedAt: string;
  /** Por qué no se aceptó. Ya no se reintenta solo: el personal toca Reintentar o lo resuelve. */
  problem: string | null;
  /** Caja ya recibió el efectivo (`cobrar_ahora`). */
  collectedCash: boolean;
  /** Llegó con este folio pero el cobro no se aplicó: reenviarlo no lo arregla. */
  registeredFolio: number | null;
}

export interface OfflineStaffOrdersSnapshot {
  day: string;
  nextSequence: number;
  orders: OfflineStaffOrder[];
}

export function pendingOf(snapshot: OfflineStaffOrdersSnapshot): OfflineStaffOrder[] {
  return snapshot.orders.filter((order) => order.problem === null);
}

export function problemsOf(snapshot: OfflineStaffOrdersSnapshot): OfflineStaffOrder[] {
  return snapshot.orders.filter((order) => order.problem !== null);
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let i = 0; i < 8 && current; i += 1) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function apiErrorOf(error: unknown): VaiinillaApiError | null {
  for (const cause of causeChain(error)) if (cause instanceof VaiinillaApiError) return cause;
  return null;
}

const CONNECTION_CODES = new Set(['BACKEND_UNAVAILABLE', 'NETWORK_ERROR']);
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Falta de red o servidor caído: fetch rechazó (TypeError), status 0, o un 502/503/504 sin
 * sobre del backend (deploy, proxy). Un 5xx con su sobre es «el servidor está arriba».
 */
export function isConnectionProblem(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const api = apiErrorOf(error);
  if (!api) return false;
  if (api.status === 0 || CONNECTION_CODES.has(api.code)) return true;
  return GATEWAY_STATUSES.has(api.status) && api.code === 'HTTP_ERROR';
}

/** Al tomar el pedido: sin red sí se guarda; un 429 no (el servidor está arriba y pide esperar). */
export function shouldKeepOffline(error: unknown): boolean {
  return isConnectionProblem(error) && apiErrorOf(error)?.status !== 429;
}

export function isServerError(error: unknown): boolean {
  return (apiErrorOf(error)?.status ?? 0) >= 500 && !isConnectionProblem(error);
}

const RETRYABLE_4XX = new Set([401, 408, 429]);
const RETRYABLE_CODES = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED', 'TOKEN_EXPIRED', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);

/** Solo un rechazo 4xx con motivo lo aparta; lo demás se reintenta con la misma llave. */
export function shouldRetryLater(error: unknown): boolean {
  if (isConnectionProblem(error)) return true;
  const api = apiErrorOf(error);
  if (!api) return true;
  return api.status < 400 || api.status > 499 || RETRYABLE_4XX.has(api.status) || RETRYABLE_CODES.has(api.code);
}

/** La llave ya se usó con otro cuerpo: es el intento con red que sí había llegado. */
export function alreadyRegistered(error: unknown): boolean {
  return apiErrorOf(error)?.code === 'IDEMPOTENCY_KEY_REUSED';
}

export function isTooOld(order: OfflineStaffOrder, now: number): boolean {
  return now - Date.parse(order.capturedAt) > MAXIMUM_AGE_MS;
}

/** «C123-004»: inicial del rol, marca de este navegador y consecutivo del día. */
export function localFolio(roleInitial: string, deviceTag: number, sequence: number): string {
  return `${roleInitial.charAt(0).toUpperCase()}${((deviceTag % 1000) + 1000) % 1000}-${String(sequence).padStart(3, '0')}`;
}

export function cashNotRegisteredProblem(folio: number, serverMessage?: string | null): string {
  const reason = serverMessage?.trim() ? ` (${serverMessage.trim()})` : '';
  return `Cobrado sin registrar: quedó como #${folio} pero el efectivo no entró a la caja${reason}. Cóbralo en la lista de Caja para que entre al corte.`;
}

export function errorText(error: unknown, fallback: string): string {
  const api = apiErrorOf(error);
  return api?.message?.trim() || fallback;
}

/** Marca de este navegador (0 a 999) para el folio local; se guarda para que no cambie. */
export function deviceTag(store: DurableStore, random: () => number = Math.random): number {
  const saved = Number(store.read(DEVICE_TAG_KEY));
  if (store.read(DEVICE_TAG_KEY) !== null && Number.isInteger(saved) && saved >= 0 && saved < 1000) return saved;
  const generated = Math.floor(random() * 1000);
  store.write(DEVICE_TAG_KEY, String(generated));
  return generated;
}

function isSnapshot(value: unknown): value is OfflineStaffOrdersSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OfflineStaffOrdersSnapshot>;
  return typeof candidate.day === 'string' && typeof candidate.nextSequence === 'number' && Array.isArray(candidate.orders);
}

export interface EnqueueInput {
  input: StaffOrderInput;
  /** La llave del intento con red: si en realidad sí llegó, el servidor lo dice y no se duplica. */
  idempotencyKey: string;
  roleInitial: string;
  placeLabel: string;
  summary: string;
  /** Caja abierta cuando se cobró: el cobro solo entra a esa caja. */
  cashSessionId?: string | null;
}

export type SendOfflineOrder = (body: StaffOrderInput, idempotencyKey: string) => Promise<StaffOrderResult>;

export type FlushEvent =
  | { type: 'sent'; order: OfflineStaffOrder; folio: number }
  | { type: 'already-registered'; order: OfflineStaffOrder }
  | { type: 'cash-not-registered'; order: OfflineStaffOrder; folio: number }
  | { type: 'problem'; order: OfflineStaffOrder; problem: string };

export interface FlushResult {
  events: FlushEvent[];
  /** Se detuvo por falta de red o servidor caído: hay que volver a intentar después. */
  retryLater: boolean;
  /** La sesión cambió a media sincronización: se dejó de mandar. */
  aborted: boolean;
}

export interface OfflineStaffQueueOptions {
  now?: () => number;
  today?: () => string;
  newId?: () => string;
  random?: () => number;
}

function localDay(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * La cola de una sesión. Cada cambio se guarda (y se comprueba) antes de seguir; si el guardado
 * falla se lanza DurableStorageError y quien llama debe avisar o bloquear.
 */
export class OfflineStaffQueue {
  readonly scope: OfflineStaffScope;
  private readonly store: DurableStore;
  private readonly now: () => number;
  private readonly today: () => string;
  private readonly newId: () => string;
  private readonly random: () => number;
  private serverFailures = new Map<string, number>();
  private sending = false;

  constructor(store: DurableStore, scope: OfflineStaffScope, options: OfflineStaffQueueOptions = {}) {
    this.store = store;
    this.scope = scope;
    this.now = options.now ?? Date.now;
    this.today = options.today ?? (() => localDay(this.now()));
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.random = options.random ?? Math.random;
  }

  /** Lee lo guardado. Siempre de nuevo: otra pestaña o una recarga pudo cambiarlo. */
  snapshot(): OfflineStaffOrdersSnapshot {
    const raw = this.store.read(queueStorageKey(this.scope));
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSnapshot(parsed)) return parsed;
      } catch {
        // Un valor ilegible no se pisa en silencio: se reporta como falla del almacenamiento.
      }
      throw new DurableStorageError(new Error('La cola guardada no se pudo leer.'));
    }
    return { day: this.today(), nextSequence: 1, orders: [] };
  }

  private save(snapshot: OfflineStaffOrdersSnapshot): void {
    if (snapshot.orders.length === 0) {
      // Se conserva el consecutivo del día para no repetir folios locales.
      this.store.write(queueStorageKey(this.scope), JSON.stringify({ ...snapshot, orders: [] }));
      return;
    }
    this.store.write(queueStorageKey(this.scope), JSON.stringify(snapshot));
  }

  private update(id: string, change: (order: OfflineStaffOrder) => OfflineStaffOrder | null): void {
    const current = this.snapshot();
    const orders: OfflineStaffOrder[] = [];
    for (const order of current.orders) {
      if (order.id !== id) {
        orders.push(order);
        continue;
      }
      const next = change(order);
      if (next) orders.push(next);
    }
    this.save({ ...current, orders });
  }

  /** Guarda el pedido y devuelve su folio local. Si no se pudo guardar, lanza y no queda nada a medias. */
  enqueue(entry: EnqueueInput): OfflineStaffOrder {
    if (entry.input.metodo_pago !== 'efectivo') throw new Error('Sin conexión solo se toman pedidos en efectivo.');
    const tag = deviceTag(this.store, this.random);
    let current = this.snapshot();
    const today = this.today();
    if (current.day !== today) current = { ...current, day: today, nextSequence: 1 };
    const id = this.newId();
    const capturedAt = new Date(this.now()).toISOString();
    const folio = localFolio(entry.roleInitial, tag, current.nextSequence);
    const collectedCash = entry.input.cobrar_ahora === true;
    const body: StaffOrderInput = {
      ...entry.input,
      // Contrato A: `pago_diferido` va siempre explícito, como en Android.
      pago_diferido: entry.input.pago_diferido ?? false,
      sin_conexion: {
        id,
        capturado_en: capturedAt,
        folio_local: folio,
        ...(collectedCash && entry.cashSessionId ? { sesion_caja_id: entry.cashSessionId } : {}),
      },
    };
    const order: OfflineStaffOrder = {
      id,
      idempotencyKey: entry.idempotencyKey,
      localFolio: folio,
      body,
      placeLabel: entry.placeLabel,
      summary: entry.summary,
      capturedAt,
      problem: null,
      collectedCash,
      registeredFolio: null,
    };
    this.save({ ...current, nextSequence: current.nextSequence + 1, orders: [...current.orders, order] });
    return order;
  }

  /** Vuelve a la fila los que tienen arreglo (no los viejos ni los ya registrados sin cobro). */
  retry(id?: string): void {
    const current = this.snapshot();
    const now = this.now();
    this.save({
      ...current,
      orders: current.orders.map((order) => {
        if (id && order.id !== id) return order;
        const fixable = order.problem !== null && order.registeredFolio === null && !isTooOld(order, now);
        if (!fixable) return order;
        this.serverFailures.delete(order.id);
        return { ...order, problem: null };
      }),
    });
  }

  /** El personal ya lo registró o cobró a mano: se quita de la cola. */
  resolve(id: string): void {
    this.update(id, () => null);
  }

  /**
   * Manda los pendientes en el orden en que se tomaron, con el token que da `send` al momento.
   * Se detiene en la primera falla de conexión o si `isCurrent` deja de ser cierto (cambió la sesión).
   */
  async flush(send: SendOfflineOrder, isCurrent: () => boolean = () => true): Promise<FlushResult> {
    const result: FlushResult = { events: [], retryLater: false, aborted: false };
    if (this.sending) return { ...result, retryLater: true };
    this.sending = true;
    try {
      for (const order of pendingOf(this.snapshot())) {
        if (!isCurrent()) return { ...result, aborted: true };
        if (isTooOld(order, this.now())) {
          this.update(order.id, (stored) => ({ ...stored, problem: TOO_OLD_PROBLEM }));
          result.events.push({ type: 'problem', order, problem: TOO_OLD_PROBLEM });
          continue;
        }
        let created: StaffOrderResult | null = null;
        let error: unknown = null;
        try {
          created = await send(order.body, order.idempotencyKey);
        } catch (caught) {
          error = caught;
        }
        // Lo que contestó el servidor sí se guarda en esta cola aunque la sesión ya cambió:
        // el pedido es de esta cola y el resultado no depende de quién esté viendo la pantalla.
        if (created) {
          this.serverFailures.delete(order.id);
          const charge = created.cobro;
          if (order.collectedCash && charge?.estado === 'pendiente') {
            const problem = cashNotRegisteredProblem(created.folio, charge.mensaje);
            this.update(order.id, (stored) => ({ ...stored, problem, registeredFolio: created.folio }));
            result.events.push({ type: 'cash-not-registered', order, folio: created.folio });
          } else {
            this.resolve(order.id);
            result.events.push({ type: 'sent', order, folio: created.folio });
          }
        } else if (alreadyRegistered(error)) {
          this.serverFailures.delete(order.id);
          this.resolve(order.id);
          result.events.push({ type: 'already-registered', order });
        } else if (isServerError(error) && this.serverFailed(order.id)) {
          this.update(order.id, (stored) => ({ ...stored, problem: SERVER_FAILURE_PROBLEM }));
          result.events.push({ type: 'problem', order, problem: SERVER_FAILURE_PROBLEM });
        } else if (shouldRetryLater(error)) {
          if (!isServerError(error)) this.serverFailures.delete(order.id);
          return { ...result, retryLater: true };
        } else {
          const problem = errorText(error, 'No se pudo registrar el pedido.');
          this.update(order.id, (stored) => ({ ...stored, problem }));
          result.events.push({ type: 'problem', order, problem });
        }
        if (!isCurrent()) return { ...result, aborted: true };
      }
      return result;
    } finally {
      this.sending = false;
    }
  }

  private serverFailed(id: string): boolean {
    const count = (this.serverFailures.get(id) ?? 0) + 1;
    this.serverFailures.set(id, count);
    return count >= MAXIMUM_SERVER_FAILURES;
  }
}
