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

  it('un back sin cobrado_en cuenta desde creado_en y ordena del más atrasado al menos', () => {
    const viejo = order({ id: 'p2', folio: 13, creado_en: minutesAgo(9) });
    delete (viejo as Record<string, unknown>).cobrado_en;
    expect(lateOrders([order(), viejo], ON, NOW).map((o) => o.folio)).toEqual([13, 12]);
  });

  it('cobrado_en en null es un pedido sin cobrar (cocina prepara antes de cobrar): no cuenta', () => {
    expect(lateOrders([order({ estado: 'preparando', cobrado_en: null })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ saldo_pendiente: '20.00' })], ON, NOW)).toEqual([]);
  });

  it('un encargo para otro día no cuenta y uno de hoy cuenta desde su franja', () => {
    const d = new Date(NOW);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dia = (delta: number) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
      return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    };
    const franjaDesde = (minutosAtras: number) => {
      const x = new Date(NOW - minutosAtras * 60_000);
      return `${pad(x.getHours())}:${pad(x.getMinutes())}-23:59`;
    };
    expect(lateOrders([order({ fecha_entrega: dia(1), cobrado_en: minutesAgo(600) })], ON, NOW)).toEqual([]);
    const hoy = { fecha_entrega: dia(0), cobrado_en: minutesAgo(600) };
    expect(lateOrders([order({ ...hoy, franja_entrega: franjaDesde(1) })], ON, NOW)).toEqual([]);
    expect(lateOrders([order({ ...hoy, franja_entrega: franjaDesde(3) })], ON, NOW)[0]).toMatchObject({ minutes: 3 });
  });

  it('lo rechazado no cuenta como cocina', () => {
    const items = [{ estacion_preparacion: 'caja' }, { estacion_preparacion: 'cocina', rechazo: { motivo: 'x', monto: '1' } }];
    expect(lateOrders([order({ items })], ON, NOW)[0]).toMatchObject({ kitchen: false, limit: 2 });
  });
});
