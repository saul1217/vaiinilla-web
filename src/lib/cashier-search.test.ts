import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import { cashierOrderSearch, searchKey } from './cashier-search';

const order = (over: Partial<OrderDetail> & { id: string; folio: number }): OrderDetail =>
  ({
    estado: 'por_cobrar',
    metodo_pago: 'efectivo',
    destino: 'para_llevar',
    espacio: null,
    saldo_pendiente: '50.00',
    creado_en: '2026-11-16T12:00:00Z',
    items: [],
    usuario: null,
    ...over,
  }) as OrderDetail;

const diego = order({ id: 'd', folio: 112, usuario: { nombre: 'Diego Muñoz', matricula: 'A0457' }, creado_en: '2026-11-16T12:05:00Z' });
const jose = order({ id: 'j', folio: 37, usuario: { nombre: 'José Pérez', matricula: null }, estado: 'listo', saldo_pendiente: '0.00', creado_en: '2026-11-16T12:10:00Z' });
const mesa = order({ id: 'm', folio: 115, destino: 'en_espacio', espacio: { id: 4, nombre: 'Mesa 4', tipo: 'mesa' }, creado_en: '2026-11-16T11:00:00Z' });
const all = [diego, jose, mesa];

describe('buscar un pedido en Caja', () => {
  it('sin texto enseña todo lo de la fila, lo más nuevo primero', () => {
    expect(cashierOrderSearch(all, '', 'todos').map((o) => o.id)).toEqual(['j', 'd', 'm']);
  });

  it('encuentra por nombre sin acentos ni mayúsculas, y por matrícula', () => {
    expect(cashierOrderSearch(all, 'jose', 'todos').map((o) => o.id)).toEqual(['j']);
    expect(cashierOrderSearch(all, 'MUNOZ', 'todos').map((o) => o.id)).toEqual(['d']);
    expect(cashierOrderSearch(all, 'a045', 'todos').map((o) => o.id)).toEqual(['d']);
  });

  it('encuentra por el inicio del folio, con o sin #, y por la mesa', () => {
    expect(cashierOrderSearch(all, '11', 'todos').map((o) => o.id)).toEqual(['d', 'm']);
    expect(cashierOrderSearch(all, '#37', 'todos').map((o) => o.id)).toEqual(['j']);
    expect(cashierOrderSearch(all, 'mesa 4', 'todos').map((o) => o.id)).toEqual(['m']);
    expect(cashierOrderSearch(all, '9', 'todos')).toEqual([]);
  });

  it('los filtros separan lo que falta cobrar de lo listo', () => {
    expect(cashierOrderSearch(all, '', 'por_cobrar').map((o) => o.id)).toEqual(['d', 'm']);
    expect(cashierOrderSearch(all, '', 'listos').map((o) => o.id)).toEqual(['j']);
  });

  it('no repite un pedido que aparece dos veces en la fila', () => {
    expect(cashierOrderSearch([diego, diego], '', 'todos')).toHaveLength(1);
  });

  it('la llave quita acentos y la ñ queda como n', () => {
    expect(searchKey('Íñigo Peña')).toBe('inigo pena');
  });
});
