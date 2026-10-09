import type { OrderDetail } from '../types/api';
import { moneyToCents } from './money';
import { deliveryRequiresQr } from './delivery-policy';

export function hasOutstandingCashBalance(order: OrderDetail): boolean {
  if (order.pago_diferido || order.metodo_pago !== 'efectivo' || order.saldo_pendiente === undefined) return false;
  const cents = moneyToCents(order.saldo_pendiente);
  return cents === null || cents > 0n;
}

function isIndividuallyPaid(order: OrderDetail): boolean {
  if (order.saldo_pendiente === undefined) return false;
  const cents = moneyToCents(order.saldo_pendiente);
  return cents !== null && cents === 0n;
}

export function isCashierCashOrder(order: OrderDetail): boolean {
  return order.estado === 'por_cobrar';
}

/** Caja entrega con QR tanto para llevar como en mesa/espacio. */
export function isCashierDeliveryOrder(order: OrderDetail): boolean {
  return order.estado === 'listo';
}

export function isCashierPaidDeliveryOrder(order: OrderDetail): boolean {
  return isCashierDeliveryOrder(order) && !order.pago_diferido && isIndividuallyPaid(order);
}

/** A table order may be delivered while the deferred account remains unpaid. */
export function isCashierDeferredDeliveryOrder(order: OrderDetail): boolean {
  if (!isCashierDeliveryOrder(order) || order.pago_diferido !== true) return false;
  return true;
}

export function canConfirmCashierDelivery(
  order: OrderDetail,
  qrToken: string,
  entregaRequiereQr = true,
): boolean {
  return (
    (isCashierPaidDeliveryOrder(order) || isCashierDeferredDeliveryOrder(order)) &&
    (!deliveryRequiresQr(order, entregaRequiereQr) || Boolean(qrToken.trim()))
  );
}
