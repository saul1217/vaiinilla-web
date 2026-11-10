import { VaiinillaApiError, errorMessage } from './api-error';
import { calculateChange, normalizeMoneyInput } from './money';
import type { BookingAvailability, BookingCourt, ManagedSpace, SpaceAvailability, StaffBooking } from '../types/api';

/*
 * Reglas del boliche, las mismas que la app de Android: VenueContext (BOWLING: «pista», pide jugadores,
 * renta por momento), WaiterSpaceComponents (PlayersStepper, renta y renovación del turno),
 * AdminSpacesViewModel (capacidad de 1 a 99) y ApiFailure (PLAYERS_REQUIRED).
 */

export const BOWLING_TYPE = 'boliche';

/** Sin capacidad propia, el servidor acepta hasta 30 jugadores por pista (reservas.service MAX_JUGADORES). */
export const DEFAULT_MAX_PLAYERS = 30;
/** Capacidad que se puede guardar en un espacio (migración 123). */
export const MAX_CAPACITY = 99;
export const MAX_LANE_BATCH = 50;

/** Claves de caché por negocio: las pistas de una tienda no se ven en otra. */
export const bowlingKeys = (storeId: string) => ({
  availability: ['boliche', storeId, 'disponibilidad'] as const,
  board: ['boliche', storeId, 'tablero'] as const,
  bookings: (date: string) => ['boliche', storeId, 'turnos', date] as const,
  lanes: ['boliche', storeId, 'pistas'] as const,
});

export function isBowling(availability: Pick<BookingAvailability, 'tipo_establecimiento'> | null | undefined): boolean {
  return availability?.tipo_establecimiento === BOWLING_TYPE;
}

/** Editar pistas (precio, capacidad, alta) es del admin; rentar y cobrar, de admin, Caja y mesero. */
export function canEditLanes(role: string): boolean {
  return role === 'admin';
}

export function canRentLanes(role: string): boolean {
  return role === 'admin' || role === 'cajero' || role === 'mesero';
}

// region Jugadores y capacidad

/** Tope del selector de jugadores: la capacidad de la pista o el del servidor. */
export function maxPlayers(court: Pick<BookingCourt, 'capacidad'> | null | undefined): number {
  const capacity = court?.capacidad;
  return capacity && capacity > 0 ? Math.min(capacity, MAX_CAPACITY) : DEFAULT_MAX_PLAYERS;
}

/** Sube o baja jugadores sin salir de 0 (sin anotar) a la capacidad. */
export function stepPlayers(current: number, delta: number, max: number): number {
  return Math.max(0, Math.min(max, current + delta));
}

/** «Sin anotar», «1 jugador» o «4 jugadores». */
export function playersLabel(players: number | null | undefined): string {
  if (!players || players <= 0) return 'Sin anotar';
  return players === 1 ? '1 jugador' : `${players} jugadores`;
}

/** «Caben 6» o «Hasta 30 (sin capacidad)». */
export function capacityLabel(capacity: number | null | undefined): string {
  if (!capacity) return `Hasta ${DEFAULT_MAX_PLAYERS} jugadores (sin capacidad)`;
  return capacity === 1 ? 'Cabe 1 jugador' : `Caben ${capacity} jugadores`;
}

/** Lo escrito como capacidad: número de 1 a 99, `null` si se vacía o `undefined` si no sirve. */
export function parseCapacity(raw: string): number | null | undefined {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d{1,2}$/.test(value)) return undefined;
  const number = Number(value);
  return number >= 1 && number <= MAX_CAPACITY ? number : undefined;
}

// endregion

// region Duración y turnos

/** «1 h», «1 h 30» o «45 min». */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** Duraciones que se ofrecen en una pista: las suyas, o las del negocio si el servidor no las manda. */
export function laneDurations(court: Pick<BookingCourt, 'duraciones_min'>, availability: Pick<BookingAvailability, 'duraciones_min'>): number[] {
  const own = court.duraciones_min?.length ? court.duraciones_min : availability.duraciones_min ?? [];
  return [...new Set(own)].filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
}

/** Precio de la renta: precio por hora × duración, en texto «300.00». */
export function rentalPrice(hourly: string | null, minutes: number): string | null {
  if (!hourly || !/^\d+(\.\d{1,2})?$/.test(hourly)) return null;
  const [pesos = '0', cents = ''] = hourly.split('.');
  const hourlyCents = Number(pesos) * 100 + Number(cents.padEnd(2, '0'));
  const total = Math.round((hourlyCents * minutes) / 60);
  return `${Math.floor(total / 100)}.${String(total % 100).padStart(2, '0')}`;
}

export type LaneState = 'libre' | 'en_turno' | 'reservada' | 'cerrada' | 'sin_precio';

export interface LaneStatus {
  state: LaneState;
  /** Fin del turno en curso o inicio de la siguiente reserva. */
  until: string | null;
  next: string | null;
}

/**
 * Cómo está la pista ahora: en turno (lo ocupado cubre `ahora`), libre, cerrada o sin precio.
 * El fin del turno lo da `fin_previsto` del tablero de espacios si lo hay: con él se renueva.
 */
export function laneStatus(
  court: BookingCourt,
  now: Date,
  board?: Pick<SpaceAvailability, 'estado' | 'fin_previsto'> | null,
): LaneStatus {
  if (!court.rentable || court.precio_hora === null) return { state: 'sin_precio', until: null, next: null };
  const at = now.getTime();
  const intervals = [...court.ocupado].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const current = intervals.find((item) => Date.parse(item.inicio) <= at && Date.parse(item.fin) > at);
  const next = intervals.find((item) => Date.parse(item.inicio) > at && item.motivo !== 'cerrado');
  if (current?.motivo === 'cerrado') return { state: 'cerrada', until: null, next: null };
  const boardBusy = board?.estado === 'ocupada' || board?.estado === 'en_gracia';
  if (current || boardBusy) {
    return { state: 'en_turno', until: board?.fin_previsto ?? current?.fin ?? null, next: next?.inicio ?? null };
  }
  return { state: next ? 'reservada' : 'libre', until: null, next: next?.inicio ?? null };
}

/** Renovar empieza donde termina el turno abierto; sin fin previsto no se puede renovar. */
export function renewalStart(board: Pick<SpaceAvailability, 'estado' | 'fin_previsto'> | null | undefined): string | null {
  if (!board || (board.estado !== 'ocupada' && board.estado !== 'en_gracia')) return null;
  return board.fin_previsto ?? null;
}

// endregion

// region Cobro

/** Se puede apartar: con jugadores entre 1 y la capacidad, salvo la renovación que hereda los del turno. */
export function canRequestRental(players: number, max: number, renewal: boolean): boolean {
  if (renewal) return players >= 0 && players <= max;
  return players >= 1 && players <= max;
}

/** Cambio del efectivo recibido, o null si no alcanza o el monto no es válido. */
export function rentalChange(received: string, amount: string): string | null {
  return calculateChange(normalizeMoneyInput(received), amount);
}

const BOWLING_ERRORS: Record<string, string> = {
  PLAYERS_REQUIRED: 'Indica cuántos van a jugar para rentar la pista.',
  SLOT_TAKEN: 'La pista ya está ocupada en ese horario. Actualizamos el tablero.',
  SPACE_NOT_RENTABLE: 'Esta pista no tiene precio por hora: pídele al administrador que se lo ponga.',
  ESTABLISHMENT_NOT_RECEIVING: 'No hay una sesión de caja abierta: ábrela en Caja para cobrar en efectivo.',
  INSUFFICIENT_CASH_RECEIVED: 'El efectivo recibido no alcanza para la renta.',
  OUTSIDE_BOOKING_HOURS: 'La pista no se renta a esa hora: revisa el horario de reservas.',
  RESERVATION_DAY_CLOSED: 'Hoy no se rentan las pistas.',
  RESERVATION_ALREADY_BILLED: 'Esta renta ya tiene un cobro en curso.',
};

/** Mensaje para el personal; PLAYERS_OVER_CAPACITY usa el del servidor, que dice cuántos caben. */
export function bowlingErrorMessage(error: unknown): string {
  if (error instanceof VaiinillaApiError) {
    if (error.code === 'PLAYERS_OVER_CAPACITY') return error.message;
    const known = BOWLING_ERRORS[error.code];
    if (known) return known;
    if (error.status === 403) return 'Tu rol no puede hacer esto.';
  }
  return errorMessage(error);
}

// endregion

// region Turnos del día

const BOOKING_STATUS: Record<string, string> = {
  pendiente_pago: 'Por cobrar',
  confirmada: 'Pagada',
  en_curso: 'En la pista',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  conflicto: 'Con conflicto',
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS[status] ?? status;
}

/** Los turnos del día por hora, sin las canceladas ni expiradas, que ya no ocupan pista. */
export function liveBookings(bookings: StaffBooking[]): StaffBooking[] {
  return bookings
    .filter((booking) => booking.estado !== 'cancelada' && booking.estado !== 'expirada')
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** «Ana · 4 jugadores»; sin datos, vacío. */
export function bookingWho(booking: Pick<StaffBooking, 'cliente' | 'nombre_cliente' | 'jugadores'>): string {
  const name = booking.nombre_cliente ?? booking.cliente?.nombre ?? null;
  const players = booking.jugadores && booking.jugadores > 0 ? playersLabel(booking.jugadores) : null;
  return [name, players].filter(Boolean).join(' · ');
}

// endregion

// region Pistas (admin)

/** Las pistas son los espacios `cancha` del negocio. */
export function lanesOf(spaces: ManagedSpace[]): ManagedSpace[] {
  return spaces.filter((space) => space.tipo === 'cancha').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

/** «Renta $300.00 MXN por hora · Caben 6 jugadores» o «Sin precio: no se renta». */
export function laneDetail(space: Pick<ManagedSpace, 'precio_hora' | 'capacidad' | 'activo'>): string {
  const price = space.precio_hora ? `Renta $${space.precio_hora} MXN por hora` : 'Sin precio: no se renta';
  const parts = [price, capacityLabel(space.capacidad)];
  if (!space.activo) parts.push('Apagada');
  return parts.join(' · ');
}

export interface LaneBatchDraft {
  prefix: string;
  from: string;
  to: string;
  capacity: string;
}

export const DEFAULT_LANE_BATCH: LaneBatchDraft = { prefix: 'Pista', from: '1', to: '6', capacity: '6' };

const toInt = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);

/** Cuántas pistas se crean; 0 si los números no cuadran o pasan del tope. */
export function laneBatchCount(draft: LaneBatchDraft): number {
  const from = toInt(draft.from);
  const to = toInt(draft.to);
  if (from === null || to === null || from < 1 || to < from) return 0;
  const count = to - from + 1;
  return count > MAX_LANE_BATCH ? 0 : count;
}

/** El cuerpo de POST /espacios/lote, o el motivo por el que no se puede mandar. */
export function laneBatchInput(
  draft: LaneBatchDraft,
): { ok: true; input: { tipo: 'cancha'; prefijo: string; desde: number; hasta: number; capacidad?: number } } | { ok: false; error: string } {
  const prefix = draft.prefix.trim();
  if (!prefix) return { ok: false, error: 'Escribe cómo se llaman las pistas, por ejemplo «Pista».' };
  const count = laneBatchCount(draft);
  if (count === 0) return { ok: false, error: `Revisa los números: de menor a mayor y hasta ${MAX_LANE_BATCH} pistas a la vez.` };
  const capacity = parseCapacity(draft.capacity);
  if (capacity === undefined) return { ok: false, error: `La capacidad va de 1 a ${MAX_CAPACITY} jugadores, o vacía.` };
  return {
    ok: true,
    input: {
      tipo: 'cancha',
      prefijo: prefix,
      desde: Number(draft.from.trim()),
      hasta: Number(draft.to.trim()),
      ...(capacity === null ? {} : { capacidad: capacity }),
    },
  };
}

// endregion
