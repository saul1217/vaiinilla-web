import type { OrderDetail } from '../types/api';

export function isCashierCashOrder(order: OrderDetail): boolean {
  return order.estado === 'por_cobrar';
}

/** Caja entrega con QR tanto para llevar como en mesa/espacio. */
export function isCashierDeliveryOrder(order: OrderDetail): boolean {
  return order.estado === 'listo';
}

export function canConfirmCashierDelivery(order: OrderDetail, qrToken: string): boolean {
  return isCashierDeliveryOrder(order) && Boolean(qrToken.trim());
}
