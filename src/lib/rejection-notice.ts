import { formatMoney } from './money';
import type { ItemRejectionResult, OrderDetail } from '../types/api';

/**
 * El aviso tras quitar un artículo: qué pasa con el dinero. Una devolución manual
 * (terminal, saldo o mezcla) es una tarea de Caja con método y monto, no un detalle.
 */
export function itemRejectionNotice(order: OrderDetail, name: string, result: ItemRejectionResult | null): string {
  const base = `Se quitó ${name} del pedido ${order.folio}. El cliente verá el motivo.`;
  const rechazo = result?.rechazo;
  if (!rechazo || rechazo.monto === '0.00' || rechazo.metodo_reembolso === 'ninguno') return base;
  const monto = formatMoney(rechazo.monto);
  if (rechazo.metodo_reembolso === 'efectivo') return `${base} Entrega ${monto} del cajón al cliente.`;
  if (rechazo.metodo_reembolso === 'stripe') return `${base} Se reembolsan ${monto} a su tarjeta.`;
  const metodo = (result?.devolucion?.metodo_original ?? 'otro medio').replace('+', ' y ');
  return `${base} Devolución pendiente: ${monto} (se pagó con ${metodo}). Caja debe entregarla y confirmarla.`;
}
