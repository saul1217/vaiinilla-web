import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchSettings } from './settings-index';

const ids = (query: string, ctx = {}) => searchSettings(query, ctx).map((entry) => entry.id);

describe('buscador de ajustes', () => {
  it('encuentra sin acentos ni mayúsculas', () => {
    expect(normalizeSearch('  Código ')).toBe('codigo');
    expect(ids('horario')).toContain('horario');
    expect(ids('COCINA')).toContain('quien-prepara');
    expect(ids('')).toEqual([]);
  });

  it('todas las palabras tienen que estar', () => {
    expect(ids('pago caja')).toContain('pago-en-caja');
    expect(ids('pago zzz')).toEqual([]);
  });

  it('el tipo de negocio no sale si Vaiinilla lo fijó', () => {
    expect(ids('tipo', { settings: { tipo_bloqueado: false } })).toContain('tipo');
    expect(ids('tipo', { settings: { tipo_bloqueado: true } })).not.toContain('tipo');
  });

  it('pedir el código al cobrar solo con un back que lo tiene (225)', () => {
    expect(ids('cobrar', { settings: { cobro_requiere_codigo: false } })).toContain('codigo-al-cobrar');
    expect(ids('cobrar', { settings: {} })).not.toContain('codigo-al-cobrar');
  });

  it('la escuela solo con modo escuela y su pantalla prendida', () => {
    const on = { school: true };
    expect(ids('padron', { flags: on, settings: { modo_escuela: true } })).toContain('escuela');
    expect(ids('padron', { flags: on, settings: { modo_escuela: false } })).not.toContain('escuela');
    expect(ids('padron', { flags: { school: false }, settings: { modo_escuela: true } })).not.toContain('escuela');
  });

  it.each([
    ['cashback', 'cashback', 'cashback'],
    ['wallet', 'clientes', 'saldo-clientes'],
    ['inventory', 'inventario', 'inventario'],
    ['offline', 'internet', 'sin-internet'],
    ['assistant', 'asistente', 'asistente'],
  ] as const)('%s apagado esconde su pantalla', (name, query, id) => {
    expect(ids(query, { flags: { [name]: true } })).toContain(id);
    expect(ids(query, { flags: { [name]: false } })).not.toContain(id);
  });
});
