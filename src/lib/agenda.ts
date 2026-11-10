// Cuentas puras de la agenda de reservas: días que se pueden ver, inicios libres de cada cancha,
// duraciones que caben, qué se puede mover o cancelar, y cómo se mueve una reserva con las rutas
// que ya tiene el back (no hay ruta de reprogramar). Mismo criterio que ReservationSlots de Android.
import { formatMoney } from './money';
import type { BookingCancelRefund, CourtAvailabilityCourt, CourtAvailabilityDay, OperationalRole, StaffBooking, StaffBookingInput } from '../types/api';

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
  markCashLater: (bookingId: string) => Promise<unknown>;
  /** Cancela la reserva original. */
  cancel: (bookingId: string) => Promise<unknown>;
  /**
   * Suelta el horario nuevo si algo falla. Va aparte de `cancel` porque es otra cancelación y
   * necesita su propia Idempotency-Key (el back compara la reserva en el hash). Sin ella usa `cancel`.
   */
  release?: (bookingId: string) => Promise<unknown>;
}

export class MoveBookingError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MoveBookingError';
  }
}

/**
 * Mueve una reserva sin ruta de reprogramar: aparta el horario nuevo con el mismo nombre (y
 * jugadores), si la original ya estaba por cobrar en efectivo deja la nueva igual, y al final
 * cancela la original. Si algo falla después de apartar, suelta la nueva para no dejar dos.
 * Apartar primero evita perder el horario original si el nuevo ya está tomado (SLOT_TAKEN).
 */
export async function moveBooking(deps: MoveDeps, booking: StaffBooking, target: MoveTarget): Promise<{ id: string }> {
  const name = booking.nombre_cliente?.trim() || booking.cliente?.nombre?.trim();
  const created = await deps.create({
    espacio_id: target.espacio_id,
    inicio: target.inicio,
    duracion_min: target.duracion_min,
    ...(name ? { nombre_cliente: name.slice(0, 120) } : {}),
    ...(booking.jugadores ? { jugadores: booking.jugadores } : {}),
  });
  const undo = async () => {
    try {
      await (deps.release ?? deps.cancel)(created.id);
    } catch {
      // Si tampoco se puede soltar, vence sola a los 10 minutos.
    }
  };
  if (booking.pedido_id) {
    try {
      await deps.markCashLater(created.id);
    } catch (error) {
      await undo();
      throw new MoveBookingError('No se pudo dejar el horario nuevo por cobrar en Caja. La reserva sigue en su horario original.', error);
    }
  }
  try {
    await deps.cancel(booking.id);
  } catch (error) {
    await undo();
    throw new MoveBookingError('No se pudo soltar el horario original. La reserva sigue en su horario original.', error);
  }
  return created;
}

const REFUND_METHOD: Record<string, string> = { efectivo: 'efectivo', saldo: 'saldo', tarjeta: 'tarjeta' };

/**
 * Qué pasó con el dinero según la respuesta de la cancelación (`reembolso.salida` y `metodo`),
 * no según lo que se escribió en el formulario: el monto es el que registró el back.
 */
export function refundSummary(refund: BookingCancelRefund): { amount: string; route: string } {
  const method = REFUND_METHOD[refund.metodo] ?? refund.metodo;
  const amount = `${formatMoney(refund.monto)} de ${formatMoney(refund.monto_pagado)} pagados (${method})`;
  switch (refund.salida) {
    case 'ninguna':
      return { amount, route: 'Sin reembolso: solo quedó el registro con el motivo.' };
    case 'cartera':
      return {
        amount,
        route: `Regresó a la cartera del cliente.${refund.saldo_nuevo ? ` Su saldo ahora es ${formatMoney(refund.saldo_nuevo)}.` : ''}`,
      };
    case 'caja':
      return { amount, route: 'Sale en efectivo de la caja abierta: entrégalo al cliente.' };
    case 'devolucion_pendiente':
      return {
        amount,
        route: refund.metodo === 'efectivo'
          ? 'No había caja abierta: quedó como devolución pendiente en efectivo, para entregarla desde Caja.'
          : 'Quedó como devolución pendiente: Caja la confirma en Devoluciones.',
      };
    default:
      return { amount, route: `Salida: ${refund.salida}.` };
  }
}

/** Mensaje de un error al cancelar, con el tope que manda el back en `REFUND_AMOUNT_EXCEEDS_PAID`. */
export function cancelErrorMessage(code: string | undefined, details: unknown): string | null {
  if (code === 'RESERVATION_NOT_CANCELLABLE') return 'Esta reserva ya estaba cancelada o cambió de estado. Actualizamos la agenda.';
  if (code === 'RESERVATION_EXPIRED') return 'Esta reserva ya venció: el horario quedó libre. Actualizamos la agenda.';
  if (code === 'REFUND_ALREADY_DONE') return 'Esta reserva ya se reembolsó. Actualizamos la agenda.';
  if (code === 'REFUND_AMOUNT_EXCEEDS_PAID') {
    const first = Array.isArray(details) ? details[0] as { monto_pagado?: unknown } | undefined : undefined;
    const cap = typeof first?.monto_pagado === 'string' || typeof first?.monto_pagado === 'number' ? String(first.monto_pagado) : null;
    return cap ? `El reembolso no puede ser mayor a lo pagado (${formatMoney(cap)}).` : 'El reembolso no puede ser mayor a lo pagado.';
  }
  return null;
}
