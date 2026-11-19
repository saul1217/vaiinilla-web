import type { OrderDetail, OrderSpace, PreparationStation } from '../types/api';
import { hasOutstandingCashBalance } from './cashier-queue';

/** Los lugares donde se forma gente para pedir: cada uno puede tener su propia caja. */
const LINE_TYPES: readonly OrderSpace['tipo'][] = ['barra', 'drive_thru'];

export function cashierLines(spaces: OrderSpace[]): OrderSpace[] {
  return spaces
    .filter((space) => LINE_TYPES.includes(space.tipo))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

/** El pedido nació en una fila (una barra o un drive-thru), no en una mesa ni sin lugar. */
export function isLineOrder(order: OrderDetail): boolean {
  return order.espacio !== null && LINE_TYPES.includes(order.espacio.tipo);
}

/**
 * Los pedidos de una fila. Con `null` se ve todo, que es como trabaja un negocio de una sola
 * caja. Elegir fila solo esconde lo de las otras filas: lo de mesa o sin lugar lo sigue viendo
 * toda Caja, porque nadie más lo va a reclamar y esconderlo sería peor que verlo dos veces.
 */
export function ordersInLine(orders: OrderDetail[], lineId: number | null): OrderDetail[] {
  if (lineId === null) return orders;
  return orders.filter((order) => !isLineOrder(order) || order.espacio?.id === lineId);
}

/** Cuántos pedidos de otras filas deja de ver esta caja al elegir la suya. */
export function hiddenByLine(orders: OrderDetail[], lineId: number | null): number {
  if (lineId === null) return 0;
  return orders.filter((order) => isLineOrder(order) && order.espacio?.id !== lineId).length;
}

function liveItems(order: OrderDetail, station: PreparationStation) {
  return order.items.filter((item) => item.estacion_preparacion === station && !item.rechazo);
}

/** La estación ya selló lo suyo y el pedido espera a la otra. */
export function stationDone(order: OrderDetail, station: PreparationStation): boolean {
  const pending = order.estaciones_pendientes ?? [];
  return pending.length > 0 && !pending.includes(station);
}

/**
 * Lo que la barra tiene que preparar: cobrado o en preparación, con artículos de Caja vivos y
 * sin sellar todavía. Solo tiene sentido con «La barra prepara» encendida. Lo que todavía debe
 * efectivo no sale aquí: ya está en «Por cobrar», y verlo dos veces confunde.
 */
export function barQueue(orders: OrderDetail[]): OrderDetail[] {
  return orders
    .filter((order) =>
      (order.estado === 'cobrado' || order.estado === 'preparando') &&
      !hasOutstandingCashBalance(order) &&
      liveItems(order, 'caja').length > 0 &&
      !stationDone(order, 'caja'))
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

/** Lo que Caja prepara de este pedido, para que la barra no lea lo de cocina. */
export function barItems(order: OrderDetail) {
  return liveItems(order, 'caja');
}

/** Minutos desde que el pedido quedó listo: lo que lleva avisado el cliente. */
export function minutesSinceReady(order: OrderDetail, now: Date): number | null {
  if (!order.listo_en) return null;
  const ms = now.getTime() - new Date(order.listo_en).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 60_000));
}

/** Pasada la hora se dice en horas, y pasado el día en días: «hace 30898 min» no se lee. */
export function readyNotice(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes === 0) return 'Recién avisado';
  if (minutes < 60) return `Avisado hace ${minutes} min`;
  if (minutes < 1440) return `Avisado hace ${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1440);
  return `Avisado hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Desde aquí un aviso se considera viejo: la cajera debería buscar al cliente. */
export const STALE_READY_MINUTES = 10;

export function isStaleReady(minutes: number | null): boolean {
  return minutes !== null && minutes >= STALE_READY_MINUTES;
}

const STORAGE_KEY = 'caja.fila.v1';

function storageKey(venueId: string) {
  return `${STORAGE_KEY}:${venueId}`;
}

/** La fila se guarda en el equipo, no en la cuenta: la tablet de la barra 2 sigue siendo la barra 2. */
export function readSavedLine(venueId: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey(venueId));
    if (raw === null) return null;
    const id = Number(raw);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function saveLine(venueId: string, lineId: number | null) {
  try {
    if (lineId === null) window.localStorage.removeItem(storageKey(venueId));
    else window.localStorage.setItem(storageKey(venueId), String(lineId));
  } catch {
    // Sin almacenamiento (modo privado estricto) la fila dura lo que dure la pestaña.
  }
}

/** «Avisar otra vez» sirve si el cliente pasa a recogerlo y tiene cuenta a quién avisarle. */
export function canRemind(order: OrderDetail): boolean {
  return order.estado === 'listo' && order.usuario != null &&
    (order.destino === 'para_llevar' || order.recoge_en_barra === true);
}

/**
 * «No vino» solo para lo que el cliente tenía que recoger (para llevar o «Pasa por él»). En mesa
 * está sentado, y una cuenta abierta se queda en la cuenta: el backend responde 409 en ambos casos.
 */
export function canMarkNoShow(order: OrderDetail): boolean {
  return order.estado === 'listo' && order.pago_diferido !== true &&
    (order.destino === 'para_llevar' || order.recoge_en_barra === true);
}

const SCANNER_KEY = 'caja.pistola.cerrada';

/** La barra de la pistola, cerrada con la X, no vuelve a salir ese día en ese equipo. */
export function scannerHiddenToday(today = new Date()): boolean {
  try {
    return window.localStorage.getItem(SCANNER_KEY) === today.toDateString();
  } catch {
    return false;
  }
}

export function hideScannerToday(today = new Date()) {
  try {
    window.localStorage.setItem(SCANNER_KEY, today.toDateString());
  } catch {
    // Sin almacenamiento se esconde solo mientras dure la pestaña.
  }
}
