import type { OrderDetail } from '../types/api';
import { moneyToCents } from './money';
import { operationalOrderStatus } from './order-status';

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
  return (
    operationalOrderStatus(order) === 'recibido' &&
    order.metodo_pago === 'efectivo' &&
    !order.pago_diferido &&
    hasOutstandingCashBalance(order)
  );
}

/** Caja entrega con QR tanto para llevar como en mesa/espacio. */
export function isCashierDeliveryOrder(order: OrderDetail): boolean {
  return operationalOrderStatus(order) === 'listo';
}

export function isCashierPaidDeliveryOrder(order: OrderDetail): boolean {
  return isCashierDeliveryOrder(order) && isIndividuallyPaid(order);
}

export function canConfirmCashierDelivery(order: OrderDetail, qrToken: string): boolean {
  return isCashierPaidDeliveryOrder(order) && Boolean(qrToken.trim());
}
