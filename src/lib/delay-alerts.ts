import type { BusinessSettings, OrderDetail } from '../types/api';

type Thresholds = Pick<
  BusinessSettings,
  'alerta_retraso_activa' | 'alerta_retraso_sin_cocina_min' | 'alerta_retraso_cocina_min'
>;
type AlertOrder = Pick<
  OrderDetail,
  'id' | 'folio' | 'estado' | 'creado_en' | 'cobrado_en' | 'pago_pendiente' | 'items'
>;

export interface LateOrder {
  id: string;
  folio: number;
  minutes: number;
  limit: number;
  kitchen: boolean;
}

const WAITING = new Set(['cobrado', 'preparando', 'listo']);
export const DEFAULT_NO_KITCHEN_MIN = 2;
export const DEFAULT_KITCHEN_MIN = 5;

/**
 * Pedidos pagados que llevan más de su límite sin entregarse (migración 228 del back). Cuenta desde
 * `cobrado_en`; un pedido que nació pagado y viene de un back sin ese campo cuenta desde
 * `creado_en`, como las ventas. Con algo de cocina vale el límite de cocina; si no, el corto.
 */
export function lateOrders(orders: AlertOrder[], settings: Thresholds | null | undefined, nowMs: number): LateOrder[] {
  if (settings?.alerta_retraso_activa !== true) return [];
  const noKitchenMin = settings.alerta_retraso_sin_cocina_min ?? DEFAULT_NO_KITCHEN_MIN;
  const kitchenMin = settings.alerta_retraso_cocina_min ?? DEFAULT_KITCHEN_MIN;
  const late: LateOrder[] = [];
  for (const order of orders) {
    if (!WAITING.has(order.estado) || order.pago_pendiente === true) continue;
    const since = Date.parse(order.cobrado_en ?? order.creado_en);
    if (Number.isNaN(since)) continue;
    const kitchen = order.items.some((item) => item.estacion_preparacion === 'cocina');
    const limit = kitchen ? kitchenMin : noKitchenMin;
    const minutes = Math.floor((nowMs - since) / 60_000);
    if (minutes >= limit) late.push({ id: order.id, folio: order.folio, minutes, limit, kitchen });
  }
  return late.sort((a, b) => b.minutes - a.minutes);
}
