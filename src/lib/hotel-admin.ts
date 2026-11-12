import type { HotelRoom, HotelRoomBatchInput, HotelSettings, HotelSettingsInput, HotelSummary } from '../types/api';

/*
 * Reglas del admin de Hotel, las mismas que la app de Android
 * (vaiinilla-android ui/hotel/admin: HotelAdminSummary, HotelRoomsAdmin y HotelSettingsAdmin).
 */

/** Claves de caché por negocio: el hotel de una tienda no se ve en otra. */
export const hotelKeys = (storeId: string) => ({
  settings: ['hotel', storeId, 'configuracion'] as const,
  summary: ['hotel', storeId, 'resumen'] as const,
  rooms: ['hotel', storeId, 'habitaciones'] as const,
});

// region Resumen

/** Una solicitud lleva más de esto sin tomarse y el mosaico la marca en coral. */
export const HOTEL_SLOW_REQUEST_MINUTES = 10;

/** Minutos que lleva abierta la solicitud más vieja, contra la hora en que el servidor armó el resumen. */
export function oldestRequestMinutes(summary: HotelSummary, now: Date = new Date()): number | null {
  const since = summary.solicitudes.mas_vieja_desde;
  if (!since) return null;
  const from = Date.parse(since);
  const to = summary.consultado_en ? Date.parse(summary.consultado_en) : now.getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.floor((to - from) / 60_000));
}

export function kitchenNow(count: number): string {
  if (count === 0) return 'Cocina libre';
  if (count === 1) return '1 en cocina ahora';
  return `${count} en cocina ahora`;
}

export function ordersLabel(count: number): string {
  return count === 1 ? '1 pedido' : `${count} pedidos`;
}

/** «304, 112 y 408 hacen check-out»; sin nombres, solo cuántas. */
export function departuresDetail(summary: HotelSummary): string {
  const rooms = summary.salidas_hoy
    .map((item) => (item.habitacion?.nombre ?? '').replace(/^Habitación/, '').trim())
    .filter((name) => name.length > 0);
  if (rooms.length === 1) return `${rooms[0]} hace check-out`;
  if (rooms.length > 1) return `${rooms.slice(0, -1).join(', ')} y ${rooms[rooms.length - 1]} hacen check-out`;
  if (summary.salidas_hoy.length === 1) return 'Una habitación hace check-out';
  return 'Habitaciones que hacen check-out';
}

/** Fracción ocupada de 0 a 1 para la barra de ocupación. */
export function occupancy(summary: HotelSummary): number {
  const { total, ocupadas } = summary.habitaciones;
  return total > 0 ? Math.min(1, Math.max(0, ocupadas / total)) : 0;
}

// endregion

// region Habitaciones

export const MAX_ROOM_BATCH = 500;

/** Lo que el dueño escribe para crear habitaciones en lote; todo como texto hasta que se manda. */
export interface RoomBatchDraft {
  prefix: string;
  from: string;
  to: string;
  floor: string;
  category: string;
}

export const DEFAULT_ROOM_BATCH: RoomBatchDraft = { prefix: 'Habitación', from: '101', to: '110', floor: '1', category: '' };

const toInt = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);

/** Cuántas se crean; 0 si los números no cuadran. */
export function batchCount(draft: RoomBatchDraft): number {
  const from = toInt(draft.from);
  const to = toInt(draft.to);
  if (from === null || to === null || to < from) return 0;
  return to - from + 1;
}

/** El mismo filtro que el servidor (habitaciones.service validarLote), con los textos de Android. */
export function batchProblem(draft: RoomBatchDraft): string | null {
  const prefix = draft.prefix.trim();
  const from = toInt(draft.from);
  const to = toInt(draft.to);
  if (prefix.length < 1 || prefix.length > 70) return 'El nombre base va de 1 a 70 letras.';
  if (from === null || to === null || from > 99_999 || to > 99_999) return 'Los números van de 0 a 99999.';
  if (to < from) return 'El último número debe ser mayor o igual al primero.';
  if (to - from + 1 > MAX_ROOM_BATCH) return `Se crean hasta ${MAX_ROOM_BATCH} a la vez.`;
  if (`${prefix} ${to}`.length > 80) return 'Los nombres quedarían de más de 80 letras.';
  const floor = draft.floor.trim();
  if (floor !== '' && (toInt(floor) === null || Number(floor) > 200)) return 'El piso va de 0 a 200.';
  if (draft.category.trim().length > 30) return 'La categoría va hasta 30 letras.';
  return null;
}

/** El cuerpo de POST /habitaciones/lote; piso y categoría vacíos no se mandan. */
export function batchInput(draft: RoomBatchDraft): HotelRoomBatchInput {
  const input: HotelRoomBatchInput = { prefijo: draft.prefix.trim(), desde: Number(draft.from), hasta: Number(draft.to) };
  if (draft.floor.trim() !== '') input.piso = Number(draft.floor);
  const category = draft.category.trim();
  if (category !== '') input.categoria = category;
  return input;
}

export function createLabel(count: number): string {
  if (count === 0) return 'Crear habitaciones con QR';
  if (count === 1) return 'Crear 1 habitación con QR';
  return `Crear ${count} habitaciones con QR`;
}

export function batchNotice(result: { creadas: number; convertidas: number; omitidas: string[] }): string {
  const skipped = result.omitidas.length === 0 ? '' : ` (${result.omitidas.length} ya existían)`;
  const converted = result.convertidas === 0 ? '' : `, ${result.convertidas} mesas pasaron a habitación`;
  return `Se crearon ${result.creadas} habitaciones${skipped}${converted}`;
}

/** «Habitación 2» antes que «Habitación 10»: los números se comparan como números. */
export function naturalKey(name: string): string {
  return name.replace(/\d+/g, (digits) => digits.padStart(8, '0')).toLowerCase();
}

export function sortRooms(rooms: HotelRoom[]): HotelRoom[] {
  return [...rooms].sort((a, b) => {
    const left = naturalKey(a.nombre);
    const right = naturalKey(b.nombre);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** «Piso 3 · Doble · QR activo» o, con huésped, «ocupada». */
export function roomDetail(room: HotelRoom): string {
  const category = room.categoria?.trim();
  return [
    room.piso !== null && room.piso !== undefined ? `Piso ${room.piso}` : null,
    category ? category.charAt(0).toUpperCase() + category.slice(1) : null,
    room.ocupada ? 'ocupada' : 'QR activo',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Lo que Android comparte con «Imprimir QR de todas»: una línea «Habitación 101: url» por cuarto. */
export function roomQrLines(rooms: HotelRoom[]): string {
  return rooms
    .filter((room) => room.qr_url)
    .map((room) => `${room.nombre}: ${room.qr_url}`)
    .join('\n');
}

// endregion

// region Ajustes

export const DEFAULT_LATE_CHECKOUT = '15:00';

/** La hora que se escribe: solo dígitos y los dos puntos, hasta «HH:mm». */
export function clockInput(raw: string): string {
  return raw.replace(/[^\d:]/g, '').slice(0, 5);
}

/** «HH:mm» válida; vacío no cuenta. */
export function isClock(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

/** El servidor pide dos cifras en la hora: «7:30» se manda como «07:30». */
export function padClock(value: string | null): string | null {
  if (value === null) return null;
  return /^\d:[0-5]\d$/.test(value) ? `0${value}` : value;
}

/** Un monto en el campo: dígitos y un punto con hasta dos decimales. */
export function priceInput(raw: string): string {
  const clean = raw.replace(/[^\d.]/g, '');
  const dot = clean.indexOf('.');
  if (dot < 0) return clean.slice(0, 6);
  return `${clean.slice(0, dot).slice(0, 6)}.${clean.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

/** Cada hora escrita debe ser «HH:mm»; la de cocina va completa o no va, y no puede empezar y acabar igual. */
export function settingsProblem(config: HotelSettings): string | null {
  const { cocina_desde: from, cocina_hasta: to } = config;
  if ((from === null) !== (to === null)) return 'El horario de cocina lleva las dos horas o ninguna.';
  if (from !== null && to !== null) {
    if (!isClock(from) || !isClock(to)) return 'Escribe el horario de cocina como 07:00.';
    if (padClock(from) === padClock(to)) return 'El horario de cocina no puede empezar y terminar a la misma hora.';
  }
  if (config.hora_checkout !== null && !isClock(config.hora_checkout)) return 'Escribe la hora de salida como 12:00.';
  if (config.salida_tardia_hora !== null && !isClock(config.salida_tardia_hora)) return 'Escribe la salida tardía como 15:00.';
  if (config.salida_tardia_precio !== null && !/^\d+(\.\d{0,2})?$/.test(config.salida_tardia_precio)) {
    return 'Escribe el precio como 150.00.';
  }
  return null;
}

/** «7:00 a 23:00» o «Sin horario propio». */
export function kitchenLabel(config: HotelSettings): string {
  return config.cocina_desde && config.cocina_hasta ? `${config.cocina_desde} a ${config.cocina_hasta}` : 'Sin horario propio';
}

/** El cuerpo de PUT /hotel/configuracion: sin `activo`, horas con dos cifras y sin `hora_checkout: null` (400). */
export function settingsInput(config: HotelSettings): HotelSettingsInput {
  const price = config.salida_tardia_precio;
  const input: HotelSettingsInput = {
    cargo_habitacion_activo: config.cargo_habitacion_activo,
    tarjeta_al_pedir: config.tarjeta_al_pedir,
    codigo_entrega_activo: config.codigo_entrega_activo,
    cocina_desde: padClock(config.cocina_desde),
    cocina_hasta: padClock(config.cocina_hasta),
    solicitudes_activas: config.solicitudes_activas,
    no_molestar_activo: config.no_molestar_activo,
    salida_tardia_hora: padClock(config.salida_tardia_hora),
    salida_tardia_precio: price === null ? null : price.includes('.') ? price.padEnd(price.indexOf('.') + 3, '0') : `${price}.00`,
  };
  const checkout = padClock(config.hora_checkout);
  if (checkout !== null) input.hora_checkout = checkout;
  return input;
}

export function sameSettings(a: HotelSettings, b: HotelSettings): boolean {
  return (Object.keys(a) as (keyof HotelSettings)[]).every((key) => a[key] === b[key]);
}

// endregion
