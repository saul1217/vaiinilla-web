// Cuentas puras de la agenda de reservas: días que se pueden ver, inicios libres de cada cancha,
// duraciones que caben, qué se puede mover o cancelar, y cómo se mueve una reserva con las rutas
// que ya tiene el back (no hay ruta de reprogramar). Mismo criterio que ReservationSlots de Android.
import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import type { CourtAvailabilityCourt, CourtAvailabilityDay, OperationalRole, StaffBooking, StaffBookingInput } from '../types/api';

/** Roles que el back deja crear y cancelar reservas (reservas.routes.js), menos `cliente`. */
export const AGENDA_ROLES: OperationalRole[] = ['admin', 'cajero', 'mesero'];

export const agendaKeys = {
  all: (storeId: string) => ['agenda', storeId] as const,
  day: (storeId: string, date: string | null) => ['agenda', storeId, 'dia', date ?? 'hoy'] as const,
  bookings: (storeId: string, date: string) => ['agenda', storeId, 'reservas', date] as const,
};

export const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Por pagar',
  confirmada: 'Pagada',
  en_curso: 'En juego',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
  expirada: 'Venció el apartado',
  conflicto: 'Revisar',
};

const MINUTE = 60_000;

/** `YYYY-MM-DD` más `days` días, sin depender de la zona del navegador. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y!, m! - 1, d! + days));
  return value.toISOString().slice(0, 10);
}

/** De hoy (operativo del negocio) a hoy + días de anticipación. */
export function bookableDates(day: Pick<CourtAvailabilityDay, 'hoy' | 'dias_adelanto'>): string[] {
  const span = Math.max(0, Math.min(60, Number(day.dias_adelanto) || 0));
  return Array.from({ length: span + 1 }, (_, index) => addDays(day.hoy, index));
}

/** «hoy», «mañana» o «jue 12». */
export function dateLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  const label = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return label.replace('.', '');
}

/** Hora local del negocio, «18:30». */
export function clockIn(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  }
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function durationsFor(day: CourtAvailabilityDay, court: CourtAvailabilityCourt): number[] {
  const own = court.duraciones_min?.length ? court.duraciones_min : day.duraciones_min;
  return [...own].sort((a, b) => a - b);
}

/** La cancha está libre de `start` a `start + minutes` y dentro del horario. */
export function isFree(day: CourtAvailabilityDay, court: CourtAvailabilityCourt, start: string, minutes: number): boolean {
  const from = Date.parse(start);
  const to = from + minutes * MINUTE;
  if (from < Date.parse(day.abre) || to > Date.parse(day.cierra)) return false;
  return !court.ocupado.some((busy) => Date.parse(busy.inicio) < to && from < Date.parse(busy.fin));
}

export function availableDurations(day: CourtAvailabilityDay, court: CourtAvailabilityCourt, start: string): number[] {
  return durationsFor(day, court).filter((minutes) => isFree(day, court, start, minutes));
}

/** Inicios de `bloque_min` entre la apertura y el cierre donde cabe al menos la duración más corta; hoy, desde ahora. */
export function freeStarts(day: CourtAvailabilityDay, court: CourtAvailabilityCourt): string[] {
  if (day.cerrado || !court.rentable) return [];
  const block = Math.max(1, day.bloque_min || 30) * MINUTE;
  const opens = Date.parse(day.abre);
  const closes = Date.parse(day.cierra);
  const now = Date.parse(day.ahora);
  const result: string[] = [];
  for (let slot = opens; slot < closes; slot += block) {
    if (slot < now) continue;
    const iso = new Date(slot).toISOString();
    if (availableDurations(day, court, iso).length > 0) result.push(iso);
  }
  return result;
}

export function bookingName(booking: StaffBooking): string {
  return booking.nombre_cliente?.trim() || booking.cliente?.nombre?.trim() || 'Cliente';
}

export function bookingMinutes(booking: StaffBooking): number {
  return booking.duracion_min ?? Math.round((Date.parse(booking.fin) - Date.parse(booking.inicio)) / MINUTE);
}

export function bookingSpaceId(booking: StaffBooking): number | null {
  const id = Number(booking.espacio?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Sigue ocupando su horario en la agenda. */
export function isLive(booking: StaffBooking): boolean {
  return ['pendiente_pago', 'confirmada', 'en_curso', 'conflicto'].includes(booking.estado);
}

/** El back cancela la pendiente y la pagada que no ha empezado (RESERVATION_IN_PROGRESS si ya empezó). */
export function canCancel(booking: StaffBooking, now = Date.now()): boolean {
  if (booking.estado === 'pendiente_pago') return true;
  return booking.estado === 'confirmada' && Date.parse(booking.inicio) > now;
}

/** Pagada: cancelarla exige monto de reembolso y motivo. */
export function needsRefund(booking: StaffBooking): boolean {
  return booking.estado === 'confirmada';
}

/**
 * Solo se mueve una reserva sin pagar que no ha empezado. Una pagada tendría que reembolsarse y
 * volver a cobrarse (el back no tiene ruta para pasar el pago a otro horario), así que esa se cancela
 * con reembolso y se aparta de nuevo.
 */
export function canMove(booking: StaffBooking, now = Date.now()): boolean {
  return booking.estado === 'pendiente_pago' && Date.parse(booking.inicio) > now && bookingSpaceId(booking) !== null;
}

export interface MoveTarget {
  espacio_id: number;
  inicio: string;
  duracion_min: number;
}

export interface MoveDeps {
  create: (input: StaffBookingInput) => Promise<{ id: string }>;
  markCashLater: (bookingId: string) => Promise<void>;
  /** Con la misma llave el back repite la respuesta en vez de cancelar dos veces, así que se puede reintentar. */
  cancel: (bookingId: string, idempotencyKey: string) => Promise<void>;
  newKey?: () => string;
  wait?: (ms: number) => Promise<void>;
}

/** Esperas entre intentos al cancelar durante un movimiento (tres intentos en total). */
export const CANCEL_RETRY_MS = [500, 1500];

/** Un horario nuevo que no se pudo soltar: sigue apartado y puede estar por cobrar en Caja. */
export interface OrphanHold {
  id: string;
  /** Llave con la que se intentó cancelar; reintentar con ella no cancela dos veces. */
  idempotencyKey: string;
  /** Ya se había marcado por cobrar en efectivo, así que se ve en Caja. */
  byCash: boolean;
}

export class MoveBookingError extends Error {
  constructor(message: string, readonly cause?: unknown, readonly orphan?: OrphanHold) {
    super(message);
    this.name = 'MoveBookingError';
  }
}

/** Errores que pueden pasar solos: sin red, el back caído o la misma llave aún en proceso. */
function isTransient(error: unknown): boolean {
  if (!(error instanceof VaiinillaApiError)) return true;
  if (error.status >= 500 || error.status === 408 || error.status === 429) return true;
  return error.status === 409 && error.code === 'IDEMPOTENCY_KEY_REUSED';
}

/** La reserva ya no aparta nada (cancelada, vencida o no existe): no hay nada que soltar. */
export function isAlreadyReleased(error: unknown): boolean {
  if (!(error instanceof VaiinillaApiError)) return false;
  if (error.status === 404 || error.code === 'RESERVATION_EXPIRED') return true;
  if (error.code !== 'RESERVATION_NOT_CANCELLABLE') return false;
  const details = Array.isArray(error.details) ? error.details : [];
  return details.some((item) => ['cancelada', 'expirada'].includes((item as { estado_actual?: string })?.estado_actual ?? ''));
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Cancela con una sola llave y reintenta los errores pasajeros. */
async function cancelWithRetry(deps: MoveDeps, bookingId: string, idempotencyKey: string, released = false): Promise<void> {
  const wait = deps.wait ?? defaultWait;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await deps.cancel(bookingId, idempotencyKey);
      return;
    } catch (error) {
      if (released && isAlreadyReleased(error)) return;
      if (attempt >= CANCEL_RETRY_MS.length || !isTransient(error)) throw error;
      await wait(CANCEL_RETRY_MS[attempt]!);
    }
  }
}

/** Reintenta soltar un horario nuevo que quedó apartado tras un movimiento fallido. */
export async function releaseOrphan(deps: Pick<MoveDeps, 'cancel' | 'wait'>, orphan: OrphanHold): Promise<void> {
  await cancelWithRetry(deps as MoveDeps, orphan.id, orphan.idempotencyKey, true);
}

/** Aviso cuando ni con reintentos se pudo soltar el horario nuevo. */
export function orphanMessage(reason: string, orphan: OrphanHold): string {
  const caja = orphan.byCash ? 'y está por cobrar en Caja' : 'y puede aparecer por cobrar en Caja';
  return `No se movió la reserva: ${reason} La reserva sigue en su horario original, pero el horario nuevo también quedó apartado ${caja}. No lo cobres: suéltalo con «Soltar el horario nuevo» o cancélalo desde la agenda.`;
}

/**
 * Mueve una reserva sin ruta de reprogramar: aparta el horario nuevo con el mismo nombre (y
 * jugadores), si la original ya estaba por cobrar en efectivo deja la nueva igual, y al final
 * cancela la original. Si algo falla después de apartar, suelta la nueva para no dejar dos.
 * Apartar primero evita perder el horario original si el nuevo ya está tomado (SLOT_TAKEN).
 * No es atómico: si tampoco se puede soltar la nueva, el error lleva `orphan` para que la pantalla
 * lo diga y deje reintentar; la nueva marcada en efectivo no vence hasta su inicio y se vería en Caja.
 */
export async function moveBooking(deps: MoveDeps, booking: StaffBooking, target: MoveTarget): Promise<{ id: string }> {
  const newKey = deps.newKey ?? createIdempotencyKey;
  const name = booking.nombre_cliente?.trim() || booking.cliente?.nombre?.trim();
  const created = await deps.create({
    espacio_id: target.espacio_id,
    inicio: target.inicio,
    duracion_min: target.duracion_min,
    ...(name ? { nombre_cliente: name.slice(0, 120) } : {}),
    ...(booking.jugadores ? { jugadores: booking.jugadores } : {}),
  });
  let byCash = false;
  const fail = async (reason: string, error: unknown): Promise<never> => {
    const orphan: OrphanHold = { id: created.id, idempotencyKey: newKey(), byCash };
    try {
      await releaseOrphan(deps, orphan);
    } catch {
      throw new MoveBookingError(orphanMessage(reason, orphan), error, orphan);
    }
    throw new MoveBookingError(`${reason} La reserva sigue en su horario original.`, error);
  };
  if (booking.pedido_id) {
    try {
      await deps.markCashLater(created.id);
      byCash = true;
    } catch (error) {
      return fail('No se pudo dejar el horario nuevo por cobrar en Caja.', error);
    }
  }
  try {
    await cancelWithRetry(deps, booking.id, newKey());
  } catch (error) {
    return fail('No se pudo soltar el horario original.', error);
  }
  return created;
}
