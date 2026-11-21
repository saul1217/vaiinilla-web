import { describe, expect, it } from 'vitest';
import { lateOrders } from './delay-alerts';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    folio: 12,
    estado: 'cobrado' as const,
    creado_en: minutesAgo(30),
    cobrado_en: minutesAgo(3),
    pago_pendiente: false,
    items: [{ estacion_preparacion: 'caja' as const }],
    ...over,
  } as never;
}

const ON = { alerta_retraso_activa: true, alerta_retraso_sin_cocina_min: 2, alerta_retraso_cocina_min: 5 };

describe('lateOrders', () => {
  it('apagado o con un back sin la migración no avisa de nada', () => {
    expect(lateOrders([order()], { ...ON, alerta_retraso_activa: false }, NOW)).toEqual([]);
    expect(lateOrders([order()], { alerta_retraso_activa: null }, NOW)).toEqual([]);
    expect(lateOrders([order()], undefined, NOW)).toEqual([]);
  });

  it('sin cocina avisa a los 2 min desde el cobro; con cocina, a los 5', () => {
    expect(lateOrders([order({ cobrado_en: minutesAgo(1) })], ON, NOW)).toEqual([]);
    expect(lateOrders([order()], ON, NOW)).toEqual([{ id: 'p1', folio: 12, minutes: 3, limit: 2, kitchen: false }]);
    const burrito = { items: [{ estacion_preparacion: 'caja' }, { estacion_preparacion: 'cocina' }] };
    expect(lateOrders([order({ ...burrito, cobrado_en: minutesAgo(4) })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ ...burrito, cobrado_en: minutesAgo(6) })], ON, NOW)[0]).toMatchObject({
      minutes: 6,
      limit: 5,
      kitchen: true,
    });
  });

  it('no cuenta lo que sigue por cobrar, lo entregado ni lo cancelado', () => {
    expect(lateOrders([order({ estado: 'por_cobrar' })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ pago_pendiente: true })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ estado: 'entregado' })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ estado: 'cancelado' })], ON, NOW)).toEqual([]);
  });

  it('sin cobrado_en cuenta desde creado_en y ordena del más atrasado al menos', () => {
    const viejo = order({ id: 'p2', folio: 13, cobrado_en: undefined, creado_en: minutesAgo(9) });
    expect(lateOrders([order(), viejo], ON, NOW).map((o) => o.folio)).toEqual([13, 12]);
  });
});
