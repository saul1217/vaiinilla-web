import { describe, expect, it } from 'vitest';
import type { CashDrawerMovement, CashDrawerSummary } from '../types/api';
import {
  drawerAmountToWire,
  drawerFormula,
  drawerMoney,
  drawerMovementDetail,
  drawerMovementTitle,
  drawerMovementsNewestFirst,
  isValidCashReason,
} from './cash-drawer';

const movement = (over: Partial<CashDrawerMovement> = {}): CashDrawerMovement => ({
  id: 'm1',
  tipo: 'cobro',
  sale: false,
  monto: '120.00',
  motivo: null,
  registrado_por: null,
  pedido: null,
  devolucion_id: null,
  creado_en: '2026-11-16T18:00:00.000Z',
  ...over,
});

const summary = (over: Partial<CashDrawerSummary> = {}): CashDrawerSummary => ({
  fondo: '500.00',
  cobros_efectivo: '1180.00',
  propinas: '0.00',
  recargas: '0.00',
  entradas: '0.00',
  salidas: '0.00',
  devoluciones_efectivo: '0.00',
  efectivo_esperado: '1680.00',
  ...over,
});

describe('cajón: reglas del monto y el motivo', () => {
  it('el monto se manda con dos decimales y debe ser mayor a cero', () => {
    expect(drawerAmountToWire('150')).toBe('150.00');
    expect(drawerAmountToWire('150.5')).toBe('150.50');
    expect(drawerAmountToWire(' 0.05 ')).toBe('0.05');
    expect(drawerAmountToWire('0')).toBeNull();
    expect(drawerAmountToWire('0.00')).toBeNull();
    expect(drawerAmountToWire('-5')).toBeNull();
    expect(drawerAmountToWire('1.234')).toBeNull();
    expect(drawerAmountToWire('abc')).toBeNull();
  });

  it('el motivo pide de 3 a 160 letras sin contar espacios de las orillas', () => {
    expect(isValidCashReason('  ab  ')).toBe(false);
    expect(isValidCashReason('hielo')).toBe(true);
    expect(isValidCashReason('x'.repeat(160))).toBe(true);
    expect(isValidCashReason('x'.repeat(161))).toBe(false);
  });

  it('los montos se leen con separador de miles', () => {
    expect(drawerMoney('1180.50')).toBe('$1,180.50');
    expect(drawerMoney('0.00')).toBe('$0.00');
  });
});

describe('cajón: renglones y fórmula', () => {
  it('los renglones van del más nuevo al más viejo', () => {
    const list = drawerMovementsNewestFirst([
      movement({ id: 'viejo', creado_en: '2026-11-16T15:00:00.000Z' }),
      movement({ id: 'nuevo', creado_en: '2026-11-16T19:00:00.000Z' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['nuevo', 'viejo']);
  });

  it('cada renglón dice qué fue con las palabras del corte', () => {
    expect(drawerMovementTitle(movement({ tipo: 'apertura' }))).toBe('Fondo al abrir');
    expect(drawerMovementTitle(movement({ pedido: { id: 'p', folio: 42, espacio: null } }))).toBe('Cobro en efectivo #42');
    expect(drawerMovementTitle(movement({ tipo: 'wallet_recharge' }))).toBe('Recarga de saldo');
    expect(drawerMovementTitle(movement({ tipo: 'ajuste_entrada' }))).toBe('Entrada al cajón');
    expect(drawerMovementTitle(movement({ tipo: 'ajuste_salida', sale: true }))).toBe('Salida del cajón');
    expect(drawerMovementTitle(movement({ tipo: 'ajuste_salida', sale: true, devolucion_id: 'd1' }))).toBe('Devolución en efectivo');
  });

  it('el detalle junta motivo y quién lo anotó', () => {
    const detail = drawerMovementDetail(movement({ motivo: ' compra de hielo ', registrado_por: { nombre: 'Ana' } }));
    expect(detail).toMatch(/^compra de hielo · Ana · /);
  });

  it('la fórmula suma lo mismo que el servidor y omite lo que está en cero', () => {
    expect(drawerFormula(summary())).toBe('Fondo $500.00 + efectivo $1,180.00');
    expect(
      drawerFormula(summary({ propinas: '20.00', recargas: '100.00', entradas: '50.00', salidas: '250.00', devoluciones_efectivo: '35.00' })),
    ).toBe('Fondo $500.00 + efectivo $1,180.00 + propinas $20.00 + recargas $100.00 + entradas $50.00 − salidas $250.00 − devoluciones $35.00');
  });
});
