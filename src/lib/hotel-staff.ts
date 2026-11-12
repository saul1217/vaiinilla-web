import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import type { HotelChargeCategory, HotelRequest, HotelRequestType, HotelRoom, HotelStay, OperationalRole } from '../types/api';

/*
 * Reglas de la operación diaria del personal de hotel, las mismas que la app de Android
 * (vaiinilla-android ui/hotel/staff: HotelReceptionViewModel, HotelRoomsViewModel y HotelStaffKit).
 */

/** Claves de caché por negocio: lo de un hotel no se ve en otro. Las habitaciones comparten clave con el admin. */
export const hotelStaffKeys = (storeId: string) => ({
  stays: ['hotel', storeId, 'estancias'] as const,
  stay: (stayId: string) => ['hotel', storeId, 'estancias', stayId] as const,
  rooms: ['hotel', storeId, 'habitaciones'] as const,
  requests: ['hotel', storeId, 'solicitudes'] as const,
});

/** Cada cuánto se recarga, como en Android: Recepción 20 s y ama de llaves 15 s. */
export const RECEPTION_REFRESH_MS = 20_000;
export const HOUSEKEEPING_REFRESH_MS = 15_000;

/** Los roles que acepta el backend: estancias (cajero, admin) y limpieza de habitaciones (mesero, admin). */
export const RECEPTION_ROLES: OperationalRole[] = ['cajero', 'admin'];
export const HOUSEKEEPING_ROLES: OperationalRole[] = ['mesero', 'admin'];

/** Las noches de un check-in, de 1 a 60 como en Android. */
export const MIN_NIGHTS = 1;
export const MAX_NIGHTS = 60;

// region Utilidades

/**
 * Una llave de idempotencia por operación: un reintento tras una respuesta perdida manda la misma
 * y el servidor no repite el cargo, el check-in ni el cobro. Se olvida cuando el servidor contesta.
 */
export class RetryKeys {
  private readonly keys = new Map<string, string>();

  keyFor(...parts: unknown[]): string {
    const id = JSON.stringify(parts);
    let key = this.keys.get(id);
    if (!key) {
      key = createIdempotencyKey();
      this.keys.set(id, key);
    }
    return key;
  }

  /** Tras un éxito o un rechazo del servidor (4xx) la llave ya no sirve; tras un fallo de red se conserva. */
  settle(error: unknown, ...parts: unknown[]) {
    if (error === null || (error instanceof VaiinillaApiError && error.status >= 400 && error.status < 500)) {
      this.keys.delete(JSON.stringify(parts));
    }
  }
}

/** «90», «90.5», «1,250.75», «$90» → «90.00», «90.50», «1250.75»; vacío, cero, negativo o más de 2 decimales → null. */
export function parseAmount(text: string): string | null {
  const clean = text.trim().replace(/,/g, '').replace(/^\$/, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  const pesos = match[1]!.replace(/^0+(?=\d)/, '');
  const cents = (match[2] ?? '').padEnd(2, '0');
  if (Number(pesos) === 0 && Number(cents) === 0) return null;
  return `${pesos}.${cents}`;
}

const toCents = (value: string | null | undefined): number => {
  const amount = value ? parseAmount(value) : null;
  if (!amount) return 0;
  const [pesos, cents] = amount.split('.');
  return Number(pesos) * 100 + Number(cents);
};

const centsToText = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

const moneyFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShortFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** «4950.00» → «$4,950.00». */
export function hotelMoney(value: string | null | undefined): string {
  const number = Number(value);
  return value != null && value !== '' && Number.isFinite(number) ? `$${moneyFormat.format(number)}` : '$0.00';
}

/** «1650.00» → «$1,650»: el precio de una noche, sin centavos cuando no hay. */
export function hotelMoneyShort(value: string | null | undefined): string {
  const number = Number(value);
  return value != null && value !== '' && Number.isFinite(number) ? `$${moneyShortFormat.format(number)}` : '$0';
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-11-06» o un instante → [año, mes, día]; si no se lee, null. */
function dateParts(iso: string | null | undefined): [number, number, number] | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** «6 al 9 de nov»; si cruza de mes, «30 de oct al 2 de nov». */
export function hotelDateRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = dateParts(from);
  if (!a) return '';
  const b = dateParts(to);
  if (!b) return `${a[2]} de ${MONTHS[a[1] - 1]}`;
  if (a[0] === b[0] && a[1] === b[1]) return `${a[2]} al ${b[2]} de ${MONTHS[b[1] - 1]}`;
  return `${a[2]} de ${MONTHS[a[1] - 1]} al ${b[2]} de ${MONTHS[b[1] - 1]}`;
}

/** «2026-11-06» + 3 → «2026-11-09», en calendario (sin horas ni zona). */
export function addDays(iso: string, days: number): string {
  const parts = dateParts(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return date.toISOString().slice(0, 10);
}

/** El día de hoy del navegador como «AAAA-MM-DD»; solo si el servidor no mandó el del hotel. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** «hace 6 min», «hace 2 h», «hace 3 d»; sin fecha legible, null. */
export function hotelAge(createdAt: string | null | undefined, now: Date = new Date()): string | null {
  const then = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

/** «Habitación 304» → «304»; si no queda nada, el nombre tal cual. */
export function hotelRoomNumber(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  return raw.replace(/^Habitaci[óo]n\s*|^Hab\.?\s*/i, '') || raw;
}

const naturalKey = (name: string) => name.replace(/\d+/g, (digits) => digits.padStart(8, '0')).toLowerCase();
const byName = <T>(name: (item: T) => string) => (a: T, b: T) => {
  const left = naturalKey(name(a));
  const right = naturalKey(name(b));
  return left < right ? -1 : left > right ? 1 : 0;
};

/** Los textos de error del personal, con las palabras de Android (HotelStaffKit.staffErrorMessage). */
export function staffErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof VaiinillaApiError) {
    switch (error.code) {
      case 'ESTABLISHMENT_NOT_RECEIVING':
        return 'Abre la caja para cerrar esta cuenta: tiene pedidos por cobrar.';
      case 'ACCOUNT_TOTAL_CHANGED':
        return 'La cuenta cambió mientras la revisabas. Ya está al día; revisa el total y vuelve a cerrarla.';
      case 'REQUEST_VERSION_CONFLICT':
      case 'REQUEST_INVALID_STATE':
        return 'Otra persona ya atendió esta solicitud. Ya está al día.';
      case 'ROOM_OCCUPIED':
        return 'Esa habitación ya tiene un huésped.';
      case 'STAY_INVALID_STATE':
      case 'STAY_VERSION_CONFLICT':
        return 'Esa estancia ya cambió. Revisa la lista.';
      case 'RATE_LIMITED':
        return 'Demasiados intentos seguidos. Espera un momento.';
      case 'FORBIDDEN_ROLE':
        return 'Solo Caja puede hacer esto.';
      default:
        return error.message || fallback;
    }
  }
  return fallback;
}

// endregion

// region Recepción

/** Lo que Recepción pone en pantalla: salen hoy, en casa y por llegar. `today` es el día del hotel. */
export function receptionSections(stays: HotelStay[], today: string) {
  const inHouse = stays.filter((stay) => stay.estado === 'en_casa');
  const leavingToday = inHouse.filter((stay) => (stay.salida?.slice(0, 10) || today) <= today);
  const staying = inHouse.filter((stay) => !leavingToday.includes(stay));
  const arriving = stays.filter((stay) => stay.estado === 'reservada');
  return { leavingToday, staying, arriving };
}

/** Habitaciones libres para el check-in, en orden natural. */
export function freeRooms(rooms: HotelRoom[]): HotelRoom[] {
  return rooms.filter((room) => !room.ocupada).sort(byName((room) => room.nombre));
}

export function nightsLabel(nights: number): string {
  return nights === 1 ? '1 noche' : `${nights} noches`;
}

/** «482915» → «482 915», como lo dice recepción. */
export function stayCodeLabel(code: string | null | undefined): string {
  return (code ?? '').replace(/(.{3})(?=.)/g, '$1 ');
}

export const CHARGE_CATEGORIES: readonly { value: HotelChargeCategory; label: string }[] = [
  { value: 'minibar', label: 'Minibar' },
  { value: 'spa', label: 'Spa' },
  { value: 'salida_tardia', label: 'Salida tardía' },
  { value: 'otro', label: 'Otro' },
];

export const chargeCategoryLabel = (category: HotelChargeCategory) =>
  CHARGE_CATEGORIES.find((item) => item.value === category)?.label ?? 'Otro';

export const MAX_CHARGE_CONCEPT = 80;

/** Lo que S04 pone en pantalla, calculado de la estancia. */
export interface CheckoutBreakdown {
  nights: number;
  rate: string | null;
  stayAmount: string;
  roomServiceCount: number;
  roomServiceTotal: string;
  /** Minibar, spa y salida tardía suman por categoría; los «otro» van uno por uno con su concepto. */
  charges: { label: string; amount: string }[];
  /** El total que manda el servidor (`cuenta.total`); es el que se manda como `total_esperado`. */
  total: string;
}

export function checkoutBreakdown(stay: HotelStay): CheckoutBreakdown {
  const nights = Math.max(1, stay.noches);
  const stayCents = toCents(stay.tarifa_noche) * nights;
  // Solo lo que el check-out cobra: un pedido que alguien ya pagó aparte no entra en el total del servidor.
  const roomOrders = stay.pedidos.filter((order) => order.por_cobrar);
  const roomServiceCents = roomOrders.reduce((sum, order) => sum + toCents(order.total), 0);
  const grouped = new Map<string, number>();
  for (const charge of stay.cargos) {
    const label = charge.categoria === 'otro' ? charge.concepto : chargeCategoryLabel(charge.categoria);
    grouped.set(label, (grouped.get(label) ?? 0) + toCents(charge.monto));
  }
  const chargesCents = [...grouped.values()].reduce((sum, cents) => sum + cents, 0);
  const total = stay.cuenta?.total ?? stay.total ?? centsToText(stayCents + roomServiceCents + chargesCents);
  return {
    nights,
    rate: stay.tarifa_noche,
    stayAmount: centsToText(stayCents),
    roomServiceCount: roomOrders.length,
    roomServiceTotal: centsToText(roomServiceCents),
    charges: [...grouped.entries()].map(([label, cents]) => ({ label, amount: centsToText(cents) })),
    total,
  };
}

/** El servidor solo acepta efectivo o tarjeta en el check-out; tarjeta es una terminal externa. */
export const CHECKOUT_METHODS = [
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'efectivo', label: 'Efectivo' },
] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number]['value'];

// endregion

// region Ama de llaves

export type RoomsFilter = 'todas' | 'sucias' | 'limpias' | 'ocupadas';

export const ROOMS_FILTERS: readonly { value: RoomsFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'sucias', label: 'Sucias' },
  { value: 'limpias', label: 'Limpias' },
  { value: 'ocupadas', label: 'Ocupadas' },
];

export function matchesFilter(filter: RoomsFilter, room: HotelRoom): boolean {
  switch (filter) {
    case 'sucias':
      return room.limpieza === 'por_limpiar';
    case 'limpias':
      return room.limpieza === 'lista' && !room.ocupada;
    case 'ocupadas':
      return room.ocupada;
    default:
      return true;
  }
}

export type RoomTone = 'ocupada' | 'por_limpiar' | 'lista' | 'no_molestar';

export const ROOM_TONE_LABEL: Record<RoomTone, string> = {
  ocupada: 'OCUPADA',
  por_limpiar: 'POR LIMPIAR',
  lista: 'LISTA',
  no_molestar: 'NO MOLESTAR',
};

export function roomTone(room: HotelRoom): RoomTone {
  if (room.no_molestar) return 'no_molestar';
  if (room.ocupada) return 'ocupada';
  if (room.limpieza === 'por_limpiar') return 'por_limpiar';
  return 'lista';
}

export function roomFloors(rooms: HotelRoom[]): number[] {
  return [...new Set(rooms.map((room) => room.piso).filter((floor): floor is number => floor !== null && floor !== undefined))].sort((a, b) => a - b);
}

/** El piso que se ve: el elegido, o el primero con habitaciones por limpiar, o el más bajo. */
export function floorShown(rooms: HotelRoom[], chosen: number | null): number | null {
  const floors = roomFloors(rooms);
  if (chosen !== null && floors.includes(chosen)) return chosen;
  const dirty = rooms.filter((room) => room.limpieza === 'por_limpiar' && room.piso != null).map((room) => room.piso as number);
  if (dirty.length > 0) return Math.min(...dirty);
  return floors[0] ?? null;
}

/** Al tocar el piso del encabezado pasa al siguiente. */
export function nextFloor(rooms: HotelRoom[], chosen: number | null): number | null {
  const floors = roomFloors(rooms);
  if (floors.length < 2) return chosen;
  const index = floors.indexOf(floorShown(rooms, chosen) as number);
  return floors[(index + 1) % floors.length]!;
}

/** Una habitación sin piso no pertenece a ninguno: se ve en todos, para que nadie se quede sin limpiar. */
export function visibleRooms(rooms: HotelRoom[], filter: RoomsFilter, floor: number | null): HotelRoom[] {
  return rooms
    .filter((room) => floor === null || room.piso == null || room.piso === floor)
    .filter((room) => matchesFilter(filter, room))
    .sort(byName((room) => room.nombre));
}

const REQUEST_LABELS: Record<HotelRequestType, string> = {
  toallas: 'Toallas',
  almohadas: 'Almohadas',
  limpieza: 'Limpieza',
  cargador: 'Cargador',
  salida_tardia: 'Salida tardía',
  otro: 'Otra cosa',
};

export function sortRequests(requests: HotelRequest[]): HotelRequest[] {
  return [...requests].sort((a, b) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''));
}

/** «304 · 2 toallas»: el número de la habitación, la cantidad si pasa de una y lo que pidió. */
export function requestTitle(request: HotelRequest): string {
  const room = hotelRoomNumber(request.habitacion?.nombre);
  const type = REQUEST_LABELS[request.tipo] ?? REQUEST_LABELS.otro;
  const label = request.cantidad > 1 ? `${request.cantidad} ${type.toLowerCase()}` : type;
  return room ? `${room} · ${label}` : label;
}

/** «Pedido hace 6 min · Después de las 11:00», o quién la tomó. */
export function requestSubtitle(request: HotelRequest, now: Date = new Date()): string {
  let head: string;
  if (request.estado === 'tomada') head = `Tomada por ${request.tomada_por?.nombre || 'el personal'}`;
  else {
    const age = hotelAge(request.creado_en, now);
    head = age ? `Pedido ${age}` : 'Pedido';
  }
  const note = request.nota?.trim();
  return note ? `${head} · ${note}` : head;
}

// endregion
