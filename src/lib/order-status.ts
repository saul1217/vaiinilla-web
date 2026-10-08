import type { OperationalOrderStatus, OrderStatus } from '../types/api';
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
  estado_pago?: string;
  saldo_pendiente?: string;
}): boolean {
  if (order.saldo_pendiente !== undefined) {
    const cents = moneyToCents(order.saldo_pendiente);
    return cents !== null && cents > 0n;
  }
  return order.estado_pago !== 'pagado' && order.estado_pago !== 'sin_cargo';
}
