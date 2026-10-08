import type { OperationalOrderStatus, OrderStatus, PaymentStatus } from '../types/api';
import { moneyToCents } from './money';

const LEGACY_OPERATIONAL: Record<OrderStatus, OperationalOrderStatus> = {
  por_cobrar: 'recibido',
  cobrado: 'recibido',
  preparando: 'preparando',
  listo: 'listo',
  entregado: 'entregado',
  cancelado: 'cancelado',
  no_recogido: 'no_recogido',
  expirado: 'expirado',
};

export function operationalOrderStatus(order: {
  estado: OrderStatus;
  estado_operativo?: OperationalOrderStatus;
}): OperationalOrderStatus {
  return order.estado_operativo ?? LEGACY_OPERATIONAL[order.estado];
}

export function orderHasOutstandingBalance(order: {
  estado_pago?: PaymentStatus;
  monto_pagado?: string;
  saldo_pendiente?: string;
}): boolean {
  if (order.saldo_pendiente !== undefined) {
    const cents = moneyToCents(order.saldo_pendiente);
    if (cents === null || cents < 0n) return true;
    if (cents > 0n) return true;
    return order.estado_pago === 'pendiente' || order.estado_pago === 'parcial';
  }
  return order.estado_pago === 'pendiente' || order.estado_pago === 'parcial';
}

/** Resuelve contradicciones conservadoramente: un saldo positivo nunca se presenta como pagado. */
export function paymentStatusForOrder(order: {
  estado_pago?: PaymentStatus;
  monto_pagado?: string;
  saldo_pendiente?: string;
  total?: string;
}): PaymentStatus | undefined {
  if (order.saldo_pendiente === undefined) return order.estado_pago;
  const due = moneyToCents(order.saldo_pendiente);
  if (due === null || due < 0n) {
    return order.estado_pago === 'pagado' || order.estado_pago === 'sin_cargo'
      ? 'pendiente'
      : order.estado_pago;
  }
  if (due > 0n) {
    if (order.estado_pago === 'reembolsado') return 'reembolsado';
    const paid = order.monto_pagado === undefined ? null : moneyToCents(order.monto_pagado);
    return paid !== null && paid > 0n ? 'parcial' : 'pendiente';
  }
  if (order.estado_pago) return order.estado_pago;
  const paid = order.monto_pagado === undefined ? null : moneyToCents(order.monto_pagado);
  if (paid !== null && paid > 0n) return 'pagado';
  return order.total === '0.00' ? 'sin_cargo' : undefined;
}
