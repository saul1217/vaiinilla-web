// Avisos del mesero: qué pasó desde la última vez que se vio el tablero. Un pedido que
// cocina acaba de marcar listo (hay que llevarlo a su mesa) o una mesa que empezó a llamar.
import { CALL_REASON_LABEL, type BoardTable } from './mesero-api';
import { operationalOrderStatus } from './order-status';

export interface WaiterAlert {
  key: string;
  kind: 'ready' | 'call';
  spaceId: number;
  title: string;
  body: string;
}

/** Las claves de todo lo que hoy merece aviso en el tablero. */
export function alertKeys(tables: BoardTable[]): Set<string> {
  const keys = new Set<string>();
  for (const table of tables) {
    if (table.llamada?.estado === 'pendiente') keys.add(`call:${table.llamada.id}`);
    for (const order of table.pedidos) if (operationalOrderStatus(order) === 'listo') keys.add(`ready:${order.id}`);
  }
  return keys;
}

/** Lo nuevo respecto a `seen`: pedidos recién listos primero, luego llamadas. */
export function newAlerts(tables: BoardTable[], seen: Set<string>): WaiterAlert[] {
  const ready: WaiterAlert[] = [];
  const calls: WaiterAlert[] = [];
  for (const table of tables) {
    const place = table.espacio.nombre;
    for (const order of table.pedidos) {
      const key = `ready:${order.id}`;
      if (operationalOrderStatus(order) !== 'listo' || seen.has(key)) continue;
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
  return [...ready, ...calls];
}
