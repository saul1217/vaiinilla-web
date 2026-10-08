import type { OrderDetail } from '../types/api';
import { moneyToCents } from './money';
import { operationalOrderStatus, paymentStatusForOrder } from './order-status';

export function hasOutstandingCashBalance(order: OrderDetail): boolean {
  if (order.pago_diferido || order.metodo_pago !== 'efectivo' || order.saldo_pendiente === undefined) return false;
  const cents = moneyToCents(order.saldo_pendiente);
  return cents === null || cents > 0n;
}

function isPaymentSettled(order: OrderDetail): boolean {
  const status = paymentStatusForOrder(order);
  return status === 'pagado' || status === 'sin_cargo';
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
  return isCashierDeliveryOrder(order) && isPaymentSettled(order);
}

/** A table order may be delivered while the deferred account remains unpaid. */
export function isCashierDeferredDeliveryOrder(order: OrderDetail): boolean {
  if (!isCashierDeliveryOrder(order) || order.pago_diferido !== true) return false;
  const status = paymentStatusForOrder(order);
  return status === 'pendiente' || status === 'parcial';
}

export function canConfirmCashierDelivery(order: OrderDetail, qrToken: string): boolean {
  return (
    (isCashierPaidDeliveryOrder(order) || isCashierDeferredDeliveryOrder(order)) &&
    Boolean(qrToken.trim())
  );
}
