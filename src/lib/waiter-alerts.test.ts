import { describe, expect, it } from 'vitest';
import type { BoardTable } from './mesero-api';
import { alertKeys, newAlerts } from './waiter-alerts';

const table = (id: number, nombre: string, extra: Partial<BoardTable>): BoardTable =>
  ({ espacio: { id, nombre }, llamada: null, pedidos: [], ...extra }) as BoardTable;

const order = (id: string, folio: number, estado: string) =>
  ({ id, folio, estado, version: 1, cliente: { nombre: 'Ana' }, items_resumen: '2× Tacos', actualizado_en: '' }) as BoardTable['pedidos'][number];

describe('avisos del mesero', () => {
  it('avisa del pedido que cocina acaba de marcar listo y a qué mesa llevarlo', () => {
    const before = [table(2, 'Mesa 2', { pedidos: [order('a', 9, 'preparando')] })];
    const after = [table(2, 'Mesa 2', { pedidos: [order('a', 9, 'listo')] })];

    expect(newAlerts(before, new Set())).toEqual([]);
    const [alert] = newAlerts(after, alertKeys(before));
    expect(alert).toMatchObject({ kind: 'ready', spaceId: 2, title: 'Pedido #9 listo · llévalo a Mesa 2', body: 'Ana · 2× Tacos' });
  });

  it('no repite un aviso ya dado', () => {
    const tables = [table(2, 'Mesa 2', { pedidos: [order('a', 9, 'listo')] })];
    expect(newAlerts(tables, alertKeys(tables))).toEqual([]);
  });

  it('avisa de una llamada nueva pendiente, no de una que alguien ya tomó', () => {
    const call = { id: 'c1', motivo: 'atencion', estado: 'pendiente', cliente: { nombre: 'Luis' } };
    const pending = [table(3, 'Cancha 1', { llamada: call as BoardTable['llamada'] })];
    const taken = [table(3, 'Cancha 1', { llamada: { ...call, estado: 'en_camino' } as BoardTable['llamada'] })];

    expect(newAlerts(pending, new Set())[0]).toMatchObject({ kind: 'call', title: 'Cancha 1 está llamando' });
    expect(newAlerts(taken, new Set())).toEqual([]);
  });
});
