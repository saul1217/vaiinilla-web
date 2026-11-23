import type { BusinessSettings, OrderDetail } from '../types/api';

type Thresholds = Pick<
  BusinessSettings,
  'alerta_retraso_activa' | 'alerta_retraso_sin_cocina_min' | 'alerta_retraso_cocina_min'
>;
type AlertOrder = Pick<
  OrderDetail,
  | 'id'
  | 'folio'
  | 'estado'
  | 'creado_en'
  | 'cobrado_en'
  | 'pago_pendiente'
  | 'saldo_pendiente'
  | 'fecha_entrega'
  | 'franja_entrega'
  | 'items'
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

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Desde cuándo el pedido ya debía estar en camino: el día de entrega y el inicio de su franja, si los tiene. */
function deliveryStart(order: AlertOrder): number | null {
  if (!order.fecha_entrega) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(order.fecha_entrega);
  if (!day) return null;
  const from = /^(\d{2}):(\d{2})/.exec(order.franja_entrega ?? '');
  const hour = from ? Number(from[1]) : 0;
  const minute = from ? Number(from[2]) : 0;
  return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hour, minute).getTime();
}

/**
 * Pedidos pagados que pasaron su límite sin entregarse (migración 228 del back).
 * - Pagado es con `cobrado_en`. Si el back lo manda en null el pedido sigue por cobrar y no cuenta; solo un back
 *   anterior, que no manda el campo, cae a `creado_en`. Lo que deja saldo pendiente tampoco cuenta.
 * - Un encargo para otro día no cuenta; uno de hoy cuenta desde el inicio de su franja si se pagó antes.
 * - Con algo de cocina (sin contar lo rechazado) vale el límite de cocina; si no, el corto.
 */
export function lateOrders(orders: AlertOrder[], settings: Thresholds | null | undefined, nowMs: number): LateOrder[] {
  if (settings?.alerta_retraso_activa !== true) return [];
  const noKitchenMin = settings.alerta_retraso_sin_cocina_min ?? DEFAULT_NO_KITCHEN_MIN;
  const kitchenMin = settings.alerta_retraso_cocina_min ?? DEFAULT_KITCHEN_MIN;
  const today = localDay(nowMs);
  const late: LateOrder[] = [];
  for (const order of orders) {
    if (!WAITING.has(order.estado) || order.pago_pendiente === true) continue;
    if (Number(order.saldo_pendiente ?? 0) > 0) continue;
    if ('cobrado_en' in order && order.cobrado_en == null) continue;
    if (order.fecha_entrega && order.fecha_entrega > today) continue;
    const paid = Date.parse(order.cobrado_en ?? order.creado_en);
    if (Number.isNaN(paid)) continue;
    const since = Math.max(paid, deliveryStart(order) ?? paid);
    const kitchen = order.items.some((item) => item.rechazo == null && item.estacion_preparacion === 'cocina');
    const limit = kitchen ? kitchenMin : noKitchenMin;
    const minutes = Math.floor((nowMs - since) / 60_000);
    if (minutes >= limit) late.push({ id: order.id, folio: order.folio, minutes, limit, kitchen });
  }
  return late.sort((a, b) => b.minutes - a.minutes);
}
