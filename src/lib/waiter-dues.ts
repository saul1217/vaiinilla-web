import { centsToMoney } from './money';
import type { SpaceSessionDetail } from '../types/api';

/** Firma de los pedidos de una mesa: cambia cuando entra, avanza o se cobra un pedido. */
export function ordersSignature(orders: { id: string; estado: string; pago_pendiente?: boolean }[]): string {
  return orders.map((order) => `${order.id}:${order.estado}:${order.pago_pendiente ? 1 : 0}`).join('|');
}

/** Lo que falta cobrar de la cuenta ("123.50"), o null si no debe nada. */
export function accountDue(detail: SpaceSessionDetail): string | null {
  const account = detail.cuenta;
  if (!account) return null;
  const due = account.restante ?? account.pendiente;
  const cents = BigInt(Math.round(due * 100));
  return cents > 0n ? centsToMoney(cents) : null;
}
