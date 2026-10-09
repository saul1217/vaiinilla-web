import type { OrderDetail } from '../types/api';
import { moneyToCents } from './money';

export function hasOutstandingCashBalance(order: OrderDetail): boolean {
  if (order.pago_diferido || order.saldo_pendiente === undefined) return false;
  const cents = moneyToCents(order.saldo_pendiente);
  return cents !== null && cents > 0n;
}

function isIndividuallyPaid(order: OrderDetail): boolean {
  if (order.pago_diferido) return true;
  if (order.saldo_pendiente === undefined) return false;
  return moneyToCents(order.saldo_pendiente) === 0n;
}

export function isCashierCashOrder(order: OrderDetail): boolean {
  return order.estado === 'por_cobrar';
}

/** Caja entrega con QR tanto para llevar como en mesa/espacio. */
export function isCashierDeliveryOrder(order: OrderDetail): boolean {
  return order.estado === 'listo';
}

export function isCashierPaidDeliveryOrder(order: OrderDetail): boolean {
  return isCashierDeliveryOrder(order) && isIndividuallyPaid(order);
}

export function canConfirmCashierDelivery(order: OrderDetail, qrToken: string): boolean {
  return isCashierPaidDeliveryOrder(order) && Boolean(qrToken.trim());
}
