// Avisos del mesero: qué pasó desde la última vez que se vio el tablero. Un pedido que
// cocina acaba de marcar listo (hay que llevarlo a su mesa), una comanda que entró a cocina
// (para adelantar bebidas) o una mesa que empezó a llamar.
import { CALL_REASON_LABEL, type BoardTable } from './mesero-api';
import type { OrderStatus } from '../types/api';

export interface WaiterAlert {
  key: string;
  kind: 'ready' | 'preparing' | 'call';
  spaceId: number;
  title: string;
  body: string;
}

const IN_KITCHEN: OrderStatus[] = ['cobrado', 'preparando'];

/** Las claves de todo lo que hoy merece aviso en el tablero. */
export function alertKeys(tables: BoardTable[]): Set<string> {
  const keys = new Set<string>();
  for (const table of tables) {
    if (table.llamada?.estado === 'pendiente') keys.add(`call:${table.llamada.id}`);
    for (const order of table.pedidos) {
      if (order.estado === 'listo') keys.add(`ready:${order.id}`);
      else if (IN_KITCHEN.includes(order.estado)) keys.add(`preparing:${order.id}`);
    }
  }
  return keys;
}

/** Lo nuevo respecto a `seen`: pedidos recién listos primero, luego comandas en cocina y llamadas. */
export function newAlerts(tables: BoardTable[], seen: Set<string>): WaiterAlert[] {
  const ready: WaiterAlert[] = [];
  const preparing: WaiterAlert[] = [];
  const calls: WaiterAlert[] = [];
  for (const table of tables) {
    const place = table.espacio.nombre;
    for (const order of table.pedidos) {
      if (IN_KITCHEN.includes(order.estado)) {
        const prepKey = `preparing:${order.id}`;
        if (seen.has(prepKey)) continue;
        // Aviso temprano: el mesero puede llevar ya las bebidas mientras cocina termina.
        preparing.push({
          key: prepKey,
          kind: 'preparing',
          spaceId: table.espacio.id,
          title: `Comanda #${order.folio} en cocina · ${place}`,
          body: `${order.cliente?.nombre ?? 'Cliente'} · ${order.items_resumen}`,
        });
        continue;
      }
      const key = `ready:${order.id}`;
      if (order.estado !== 'listo' || seen.has(key)) continue;
      ready.push({
        key,
        kind: 'ready',
        spaceId: table.espacio.id,
        title: `Pedido #${order.folio} listo · llévalo a ${place}`,
        body: `${order.cliente?.nombre ?? 'Cliente'} · ${order.items_resumen}`,
      });
    }
    const call = table.llamada;
    if (call?.estado === 'pendiente' && !seen.has(`call:${call.id}`)) {
      calls.push({
        key: `call:${call.id}`,
        kind: 'call',
        spaceId: table.espacio.id,
        title: `${place} está llamando`,
        body: `${CALL_REASON_LABEL[call.motivo]} · ${call.cliente?.nombre ?? 'Cliente'}`,
      });
    }
  }
  return [...ready, ...preparing, ...calls];
}
