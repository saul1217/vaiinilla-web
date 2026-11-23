// «¿Cuál es el tuyo?» (Doop N05; cashier-search de Expo y CashierOrderSearch.kt de Android):
// el cliente dice «vengo por el de Diego» y Caja lo encuentra sin bajar por toda la fila.
// Busca sobre la fila que Caja ya tiene: el servidor no le lista los pedidos entregados.
import type { OrderDetail } from '../types/api';
import { isCashierCashOrder, isCashierDeliveryOrder } from './cashier-queue';

export type CashierSearchFilter = 'todos' | 'por_cobrar' | 'listos';

export const CASHIER_SEARCH_FILTERS: ReadonlyArray<readonly [CashierSearchFilter, string]> = [
  ['todos', 'Todos'],
  ['por_cobrar', 'Por cobrar'],
  ['listos', 'Listos'],
];

/** Sin acentos ni mayúsculas: «José» se encuentra escribiendo «jose». */
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase();
}

function matches(order: OrderDetail, needle: string): boolean {
  if (String(order.folio).startsWith(needle)) return true;
  const texts = [order.usuario?.nombre, order.usuario?.matricula, order.espacio?.nombre].filter(
    (text): text is string => Boolean(text),
  );
  return texts.some((text) => searchKey(text).includes(needle));
}

/**
 * Por el inicio del folio (con o sin «#»), por nombre o matrícula y por la mesa o cancha.
 * Lo más nuevo primero.
 */
export function cashierOrderSearch(orders: OrderDetail[], query: string, filter: CashierSearchFilter): OrderDetail[] {
  const needle = searchKey(query.trim().replace(/^#/, '').trim());
  const seen = new Set<string>();
  return orders
    .filter((order) => {
      if (seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    })
    .filter((order) => {
      if (filter === 'por_cobrar') return isCashierCashOrder(order);
      if (filter === 'listos') return isCashierDeliveryOrder(order);
      return true;
    })
    .filter((order) => !needle || matches(order, needle))
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}
