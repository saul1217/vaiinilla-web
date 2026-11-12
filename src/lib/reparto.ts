import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import { centsToMoney, moneyToCents } from './money';
import type { HomeAgendaDay, HomeOrder, HomeOrderDelivery, HomeOrderStatus } from '../types/api';

/*
 * Reglas de reparto y encargos, las mismas que la app de Android (vaiinilla-android
 * domain/model/HomeCheckout.kt HomeOrderBoard, ui/screens/admin/AdminHomeOrders.kt y
 * AdminHomeOrderPage.kt, ui/admin/AdminViewModel.kt refreshAgenda y homeAction), contra las
 * rutas de vaiinilla_back: GET /establecimiento/agenda y POST /pedidos/:id/{aceptar, rechazar,
 * en-camino, entregar-domicilio, cobrar-entrega, cancelaciones} (docs/reposteria-domicilio.md).
 */

/** Claves de caché por negocio: la agenda de una tienda no se ve en otra. */
export const repartoKeys = (storeId: string) => ({
  all: ['reparto', storeId] as const,
  agenda: (from: string, to: string) => ['reparto', storeId, 'agenda', from, to] as const,
});

/** Cada 15 s mientras la pantalla está a la vista, como «Por aceptar» en Android (AdminOrdersTab). */
export const AGENDA_REFRESH_MS = 15_000;
/** Lo entregado de los últimos 30 días alimenta «Me deben»; lo que viene, 15 días. El back acepta hasta 60. */
export const AGENDA_DAYS_BACK = 30;
export const AGENDA_DAYS_AHEAD = 15;
/** Android corta el motivo a 200 letras; el back acepta 240. */
export const REASON_MAX = 200;

// region Días

const BUSINESS_TIME_ZONE = 'America/Mexico_City';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortDay = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const deadlineFormat = new Intl.DateTimeFormat('es-MX', { timeZone: BUSINESS_TIME_ZONE, hour: 'numeric', minute: '2-digit' });

/** El día del negocio como AAAA-MM-DD. */
export function businessDay(now: Date = new Date()): string {
  return dayFormat.format(now);
}

/** Suma días a un AAAA-MM-DD sin pasar por la zona horaria del navegador. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, date! + days));
  return utc.toISOString().slice(0, 10);
}

/** El rango que pide la pantalla: 30 días atrás para «Me deben» y 15 hacia adelante. */
export function agendaRange(now: Date = new Date()): { from: string; to: string; today: string } {
  const today = businessDay(now);
  return { from: addDays(today, -AGENDA_DAYS_BACK), to: addDays(today, AGENDA_DAYS_AHEAD), today };
}

/** «Hoy», «Mañana» o «sáb 7 nov», como HomeCheckoutRules.dayLabel. */
export function dayLabel(day: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  if (day === today) return 'Hoy';
  if (day === addDays(today, 1)) return 'Mañana';
  const [year, month, date] = day.split('-').map(Number);
  // Por partes: según la versión de ICU sale «sáb, 14 nov» o «sáb 14 de nov».
  const parts = shortDay.formatToParts(new Date(Date.UTC(year!, month! - 1, date)));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value.replace(/\./g, '') ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** «Hoy · 10:00–12:00»: el día y la franja de un pedido; null si no trae día. */
export function deliveryLine(order: HomeOrder, today: string): string | null {
  const day = order.fecha_entrega ?? null;
  if (!day) return null;
  return [dayLabel(day, today), order.franja_entrega?.replace('-', '–')].filter(Boolean).join(' · ');
}

/** «Contesta antes de las 4:30 p.m.» para un encargo con plazo; null si no tiene. */
export function acceptDeadlineLabel(order: HomeOrder, now: Date = new Date()): string | null {
  if (order.estado !== 'por_aceptar' || !order.aceptar_antes_de) return null;
  const at = new Date(order.aceptar_antes_de);
  if (Number.isNaN(at.getTime())) return null;
  const time = deadlineFormat.format(at);
  return businessDay(at) === businessDay(now)
    ? `Contesta antes de las ${time}`
    : `Contesta antes del ${dayLabel(businessDay(at), businessDay(now))}, ${time}`;
}

// endregion

// region Estado y siguiente paso

/** Lo que el negocio puede hacer ahora con un pedido (HomeOrderStep de Android). */
export type HomeOrderStep = 'decidir' | 'mandar' | 'entregar' | 'cobrar';

function positive(amount: string | null | undefined): string | null {
  if (!amount) return null;
  const cents = moneyToCents(amount);
  return cents !== null && cents > 0n ? centsToMoney(cents) : null;
}

/** Lo que falta cobrar en la puerta; null si nada. */
export function amountDue(order: HomeOrder): string | null {
  return positive(order.por_cobrar_al_entregar);
}

export function paidDeposit(order: HomeOrder): string | null {
  return positive(order.anticipo);
}

export function isHomeDelivery(order: HomeOrder): boolean {
  return order.destino === 'a_domicilio';
}

/** El siguiente paso, igual que HomeOrderBoard.step; null si al negocio no le toca nada. */
export function homeOrderStep(order: HomeOrder): HomeOrderStep | null {
  switch (order.estado) {
    case 'por_aceptar':
      return 'decidir';
    // Quien trabaja sola no pasa por Cocina: el servidor deja salir un pedido a domicilio desde cobrado.
    case 'cobrado':
    case 'preparando':
    case 'listo':
      return isHomeDelivery(order) ? 'mandar' : null;
    case 'en_camino':
      return 'entregar';
    case 'entregado':
      return amountDue(order) ? 'cobrar' : null;
    // Aceptado con tarjeta: le toca pagar al cliente, el negocio espera.
    case 'por_cobrar':
    case 'cancelado':
    case 'no_recogido':
    case 'expirado':
      return null;
    default: {
      const unknown: never = order.estado;
      return unknown;
    }
  }
}

const STATE_TITLES: Record<HomeOrderStatus, string> = {
  por_aceptar: 'Por aceptar',
  por_cobrar: 'Aceptado · falta su pago',
  cobrado: 'Aceptado',
  preparando: 'Haciéndose',
  listo: 'Listo para salir',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  no_recogido: 'No recogido',
};

/** El estado en palabras; «Cobrado» en un pedido que se paga al recibir confundía (EQUIPO-50). */
export function stateLabel(order: HomeOrder): string {
  if (order.estado === 'cobrado' && amountDue(order)) return 'Aceptado · por cobrar';
  if (order.estado === 'entregado' && amountDue(order)) return 'Entregado · por cobrar';
  return STATE_TITLES[order.estado] ?? order.estado;
}

/** «Ana Pérez», o «Cliente» si el pedido no trae nombre. */
export function customerLabel(order: HomeOrder): string {
  const name = order.usuario?.nombre?.trim();
  return name ? name : 'Cliente';
}

export function firstName(order: HomeOrder): string {
  return customerLabel(order).split(/\s+/)[0] ?? 'Cliente';
}

/** «Pastel de chocolate ×2 · Galletas»: lo que lleva el pedido sin lo rechazado. */
export function itemsLabel(order: HomeOrder): string {
  return order.items
    .filter((item) => !item.rechazo)
    .map((item) => (item.cantidad > 1 ? `${item.nombre_producto} ×${item.cantidad}` : item.nombre_producto))
    .join(' · ');
}

/** La ruta en Google Maps, con las coordenadas si las hay (mapsUrl de Android). */
export function mapsUrl(delivery: HomeOrderDelivery): string {
  const destination = delivery.lat !== null && delivery.lng !== null
    ? `${delivery.lat},${delivery.lng}`
    : encodeURIComponent(delivery.direccion);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/** Solo dígitos y «+» para el enlace tel:, para que un espacio o guion no lo rompa. */
export function phoneHref(phone: string | null | undefined): string | null {
  const clean = phone?.replace(/[^\d+]/g, '') ?? '';
  return clean.length >= 7 ? `tel:${clean}` : null;
}

// endregion

// region Tablero

export interface HomeBoard {
  /** Encargos que esperan respuesta, del más viejo al más nuevo. */
  awaiting: HomeOrder[];
  /** Entregados que falta cobrar, sin repetir. */
  owed: HomeOrder[];
  owedTotal: string;
  /** De hoy en adelante, solo los días con pedidos. */
  days: HomeAgendaDay[];
}

/** Arma «Por aceptar», «Me deben» y los días como AdminViewModel.refreshAgenda. */
export function buildBoard(agenda: HomeAgendaDay[], today: string): HomeBoard {
  const all = agenda.flatMap((day) => day.pedidos);
  const unique = (orders: HomeOrder[]) => orders.filter((order, index) => orders.findIndex((other) => other.id === order.id) === index);
  const awaiting = unique(all.filter((order) => order.estado === 'por_aceptar'))
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const owed = unique(all.filter((order) => homeOrderStep(order) === 'cobrar'));
  const owedCents = owed.reduce((sum, order) => sum + (moneyToCents(amountDue(order) ?? '0') ?? 0n), 0n);
  const days = agenda
    .filter((day) => day.fecha >= today && day.pedidos.length > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { awaiting, owed, owedTotal: centsToMoney(owedCents), days };
}

export function ordersCountLabel(count: number): string {
  return count === 1 ? '1 pedido' : `${count} pedidos`;
}

// endregion

// region Acciones

export type CollectMethod = 'efectivo' | 'transferencia';

export type HomeOrderAction =
  | { type: 'aceptar' }
  | { type: 'rechazar'; motivo: string }
  | { type: 'en-camino' }
  | { type: 'entregar-domicilio'; codigo: string | null; entregaManual?: boolean }
  | { type: 'cobrar-entrega'; metodo: CollectMethod }
  | { type: 'cancelaciones'; motivo: string; versionEsperada: number };

/** El cuerpo que pide cada ruta del back. */
export function actionBody(action: HomeOrderAction): Record<string, unknown> {
  switch (action.type) {
    case 'aceptar':
    case 'en-camino':
      return {};
    case 'rechazar':
      return { motivo: action.motivo.trim() };
    case 'entregar-domicilio':
      return action.entregaManual ? { entrega_manual: true } : { codigo: action.codigo };
    case 'cobrar-entrega':
      return { metodo: action.metodo };
    case 'cancelaciones':
      return { version_esperada: action.versionEsperada, motivo: action.motivo.trim() };
  }
}

/** El aviso al terminar, como AdminViewModel.doneMessage. */
export function doneMessage(action: HomeOrderAction): string {
  switch (action.type) {
    case 'aceptar':
      return 'Encargo aceptado.';
    case 'rechazar':
      return 'Encargo rechazado; se le devuelve lo que pagó.';
    case 'en-camino':
      return 'En camino; al cliente le llegó su código.';
    case 'entregar-domicilio':
      return 'Entregado.';
    case 'cobrar-entrega':
      return 'Cobrado.';
    case 'cancelaciones':
      return 'Pedido cancelado; al cliente le llega el motivo.';
  }
}

/** Un código de entrega válido: 4 dígitos. Al escribir se descarta lo que no es dígito. */
export function cleanCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4);
}

export function reasonIsValid(text: string): boolean {
  const reason = text.trim();
  return reason.length >= 3 && reason.length <= REASON_MAX;
}

/**
 * Llaves de idempotencia por pedido, ruta y cuerpo. Un reintento tras perder la respuesta (red o
 * 5xx) reusa la llave para que el back no lo haga dos veces; un rechazo claro del back (4xx) o un
 * éxito la descartan. Un cuerpo distinto (otro código, otro método) es otra llave.
 */
export class ActionKeys {
  private readonly keys = new Map<string, string>();

  private id(orderId: string, action: HomeOrderAction): string {
    return `${orderId}|${action.type}|${JSON.stringify(actionBody(action))}`;
  }

  keyFor(orderId: string, action: HomeOrderAction): string {
    const id = this.id(orderId, action);
    let key = this.keys.get(id);
    if (!key) {
      key = createIdempotencyKey();
      this.keys.set(id, key);
    }
    return key;
  }

  settle(orderId: string, action: HomeOrderAction, error?: unknown): void {
    if (error && !isDefinitiveError(error)) return;
    this.keys.delete(this.id(orderId, action));
  }

  clear(): void {
    this.keys.clear();
  }
}

/** El back contestó y no hizo nada (4xx): reintentar con la misma llave no sirve. */
export function isDefinitiveError(error: unknown): boolean {
  return error instanceof VaiinillaApiError && error.status >= 400 && error.status < 500;
}

/** Intentos que quedan con el código equivocado (details del 422 INVALID_DELIVERY_CODE). */
export function remainingCodeAttempts(error: unknown): number | null {
  if (!(error instanceof VaiinillaApiError) || error.code !== 'INVALID_DELIVERY_CODE') return null;
  const details = Array.isArray(error.details) ? error.details : [];
  for (const detail of details) {
    const left = (detail as { intentos_restantes?: unknown } | null)?.intentos_restantes;
    if (typeof left === 'number') return left;
  }
  return null;
}

export function isCodeLocked(error: unknown): boolean {
  return error instanceof VaiinillaApiError && error.code === 'DELIVERY_CODE_LOCKED';
}

/** El mensaje para la persona; los códigos propios de domicilio no están en api-error. */
export function actionErrorMessage(error: unknown, role: string): string {
  if (error instanceof VaiinillaApiError) {
    switch (error.code) {
      case 'INVALID_DELIVERY_CODE': {
        const left = remainingCodeAttempts(error);
        return left === null
          ? 'El código no coincide. Pídele al cliente los 4 dígitos que ve en su app.'
          : `El código no coincide. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`;
      }
      case 'DELIVERY_CODE_LOCKED':
        return role === 'admin'
          ? 'Demasiados intentos con el código. Como admin puedes confirmar la entrega sin código.'
          : 'Demasiados intentos con el código. Un admin debe confirmar la entrega.';
      case 'NOTHING_TO_COLLECT':
        return 'Este pedido ya no tiene nada por cobrar.';
      case 'ORDER_NOT_FOUND':
        return 'Ese pedido ya no está disponible. Actualizamos la agenda.';
      default:
        return error.message;
    }
  }
  return 'No se pudo confirmar con el servidor. Revisa tu conexión y vuelve a intentarlo: no se repite si ya había entrado.';
}

// endregion
