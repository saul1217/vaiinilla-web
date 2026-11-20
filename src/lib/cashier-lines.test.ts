import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderDetail, OrderItem, OrderSpace } from '../types/api';
import {
  barItems,
  barQueue,
  canMarkNoShow,
  canRemind,
  hideScannerToday,
  scannerHiddenToday,
  cashierLines,
  hiddenByLine,
  minutesSinceReady,
  ordersInLine,
  readSavedLine,
  readyNotice,
  saveLine,
} from './cashier-lines';

const barra1: OrderSpace = { id: 1, nombre: 'Barra 1', tipo: 'barra' };
const barra2: OrderSpace = { id: 2, nombre: 'Barra 2', tipo: 'barra' };
const barra10: OrderSpace = { id: 10, nombre: 'Barra 10', tipo: 'barra' };
const mesa: OrderSpace = { id: 7, nombre: 'Mesa 7', tipo: 'mesa' };

function item(estacion: 'cocina' | 'caja', extra: Partial<OrderItem> = {}): OrderItem {
  return {
    id: Math.floor(Math.random() * 1e6),
    producto_id: 1,
    nombre_producto: estacion === 'caja' ? 'Chocolate caliente' : 'Torta de jamón',
    estacion_preparacion: estacion,
    cantidad: 1,
    precio_digital_unitario: '30.00',
    subtotal: '30.00',
    opciones: [],
    ...extra,
  };
}

function order(overrides: Partial<OrderDetail>): OrderDetail {
  return {
    id: `ord-${Math.random()}`,
    folio: 1,
    fecha_operativa: '2026-11-18',
    estado: 'cobrado',
    metodo_pago: 'saldo',
    destino: 'para_llevar',
    espacio: null,
    subtotal: '30.00',
    ahorro_combinado: '0.00',
    cashback_otorgado: '0.00',
    total: '30.00',
    version: 1,
    creado_en: '2026-11-18T22:00:00Z',
    actualizado_en: '2026-11-18T22:00:00Z',
    notas_cocina: null,
    usuario: { nombre: 'Ana', matricula: null },
    items: [item('caja')],
    ...overrides,
  };
}

describe('filas de caja', () => {
  it('solo barras y drive-thru son filas, en orden natural', () => {
    expect(cashierLines([barra10, mesa, barra2, barra1]).map((s) => s.nombre))
      .toEqual(['Barra 1', 'Barra 2', 'Barra 10']);
  });

  it('una fila ve lo suyo, lo de mesa y lo que no tiene lugar; «todas» ve todo', () => {
    const deBarra1 = order({ espacio: barra1 });
    const deBarra2 = order({ espacio: barra2 });
    const sinLugar = order({ espacio: null });
    const deMesa = order({ espacio: mesa, destino: 'en_espacio', estado: 'listo' });
    const todos = [deBarra1, deBarra2, sinLugar, deMesa];
    expect(ordersInLine(todos, 1)).toEqual([deBarra1, sinLugar, deMesa]);
    expect(ordersInLine(todos, null)).toEqual(todos);
    expect(hiddenByLine(todos, 1)).toBe(1);
    expect(hiddenByLine(todos, null)).toBe(0);
  });
});

describe('la barra prepara', () => {
  it('le salen los cobrados y en preparación con algo de Caja sin sellar', () => {
    const nuevo = order({ folio: 2, creado_en: '2026-11-18T22:05:00Z' });
    const viejo = order({ folio: 1, estado: 'preparando', creado_en: '2026-11-18T22:01:00Z' });
    const soloCocina = order({ items: [item('cocina')] });
    const cajaSellada = order({ estado: 'preparando', items: [item('caja'), item('cocina')], estaciones_pendientes: ['cocina'] });
    const yaListo = order({ estado: 'listo' });
    const rechazado = order({ items: [item('caja', { rechazo: { motivo: 'Se acabó', monto: '30.00' } })] });
    expect(barQueue([nuevo, viejo, soloCocina, cajaSellada, yaListo, rechazado]).map((o) => o.folio)).toEqual([1, 2]);
  });

  it('lo que todavía debe efectivo se queda en «Por cobrar», no sale también aquí', () => {
    const debe = order({ estado: 'preparando', metodo_pago: 'efectivo', saldo_pendiente: '30.00' });
    const pagado = order({ folio: 3, estado: 'preparando', metodo_pago: 'efectivo', saldo_pendiente: '0.00' });
    expect(barQueue([debe, pagado]).map((o) => o.folio)).toEqual([3]);
  });

  it('la barra lee solo lo suyo del pedido mixto', () => {
    const mixto = order({ items: [item('caja'), item('cocina')] });
    expect(barItems(mixto).map((i) => i.nombre_producto)).toEqual(['Chocolate caliente']);
  });
});

describe('aviso de listo', () => {
  const now = new Date('2026-11-18T22:30:00Z');

  it('cuenta los minutos desde que quedó listo', () => {
    expect(minutesSinceReady(order({ listo_en: '2026-11-18T22:26:10Z' }), now)).toBe(3);
    expect(minutesSinceReady(order({ listo_en: null }), now)).toBeNull();
    expect(readyNotice(0)).toBe('Recién avisado');
    expect(readyNotice(4)).toBe('Avisado hace 4 min');
    expect(readyNotice(null)).toBeNull();
  });

  it('pasada la hora habla en horas y pasado el día en días', () => {
    expect(readyNotice(59)).toBe('Avisado hace 59 min');
    expect(readyNotice(125)).toBe('Avisado hace 2 h');
    expect(readyNotice(1440)).toBe('Avisado hace 1 día');
    expect(readyNotice(30898)).toBe('Avisado hace 21 días');
  });
});

describe('fila guardada en el equipo', () => {
  beforeEach(() => window.localStorage.clear());

  it('se guarda por negocio y se borra al volver a «todas»', () => {
    saveLine('venue-a', 2);
    expect(readSavedLine('venue-a')).toBe(2);
    expect(readSavedLine('venue-b')).toBeNull();
    saveLine('venue-a', null);
    expect(readSavedLine('venue-a')).toBeNull();
  });
});

describe('avisar otra vez, no vino y la pistola', () => {
  it('solo se avisa lo que el cliente pasa a recoger y tiene cuenta', () => {
    const listo = order({ estado: 'listo', destino: 'para_llevar' });
    expect(canRemind(listo)).toBe(true);
    expect(canRemind({ ...listo, usuario: null })).toBe(false);
    expect(canRemind({ ...listo, destino: 'en_espacio', espacio: mesa })).toBe(false);
    expect(canRemind({ ...listo, destino: 'en_espacio', espacio: mesa, recoge_en_barra: true })).toBe(true);
    expect(canMarkNoShow(listo)).toBe(true);
    expect(canMarkNoShow({ ...listo, pago_diferido: true })).toBe(false);
    // En mesa no hay «no vino» (el cliente está sentado), ni siquiera con la barra que prepara.
    expect(canMarkNoShow({ ...listo, destino: 'en_espacio', espacio: mesa })).toBe(false);
    expect(canMarkNoShow({ ...listo, destino: 'en_espacio', espacio: mesa, recoge_en_barra: true })).toBe(true);
  });

  it('la pistola cerrada no vuelve a salir ese día', () => {
    window.localStorage.clear();
    const hoy = new Date('2026-11-19T12:00:00');
    expect(scannerHiddenToday(hoy)).toBe(false);
    hideScannerToday(hoy);
    expect(scannerHiddenToday(hoy)).toBe(true);
    expect(scannerHiddenToday(new Date('2026-11-20T08:00:00'))).toBe(false);
  });
});

describe('fila asignada por turno o express (migración 222)', () => {
  it('la fila asignada manda sobre el lugar donde nació', () => {
    const turno = order({ destino: 'para_llevar', fila: { id: 2, nombre: 'Barra 2', express: false } });
    const delQr = order({ destino: 'en_espacio', espacio: barra1 });
    const sinFila = order({ destino: 'para_llevar' });
    expect(ordersInLine([turno, delQr, sinFila], 2)).toEqual([turno, sinFila]);
    expect(ordersInLine([turno, delQr, sinFila], 1)).toEqual([delQr, sinFila]);
    expect(hiddenByLine([turno, delQr, sinFila], 1)).toBe(1);
  });

  it('sin fila asignada sigue contando la barra del QR', () => {
    const viaMesa = order({ destino: 'en_espacio', espacio: mesa, fila: null });
    expect(ordersInLine([viaMesa], 1)).toEqual([viaMesa]);
  });
});
