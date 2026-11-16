import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '../types/api';
import {
  allergyBanner,
  blockReason,
  cartTotalCents,
  defaultChoices,
  firstName,
  needsChoice,
  pinReady,
  purchaseItems,
  spendableCents,
  stepCart,
  studentIdentity,
  toggleChoice,
  type StudentCard,
} from './student-counter';

const card = (over: Partial<StudentCard> = {}): StudentCard => ({
  usuario_id: 'u1',
  nombre: 'Lia Prueba Kao',
  matricula: 'KAO-211',
  grupo: '1A',
  saldo: '533.00',
  gastado_hoy: '0',
  limite_diario: '100.00',
  alergenos: ['huevo', 'lactosa'],
  nota_tutor: null,
  productos_bloqueados: [1],
  categorias_bloqueadas: [20],
  productos_con_alergeno: [2],
  productos_sin_revisar: [3],
  pide_pin: false,
  pedidos_hoy: [],
  ...over,
});

const product = (id: number, over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id,
  categoria_id: 10,
  estacion_preparacion: 'cocina',
  nombre: `Producto ${id}`,
  descripcion: null,
  ingredientes: null,
  alergenos: null,
  tiempo_estimado_min: 5,
  precio_mostrador: '25.50',
  precio_digital: '25.50',
  disponible: true,
  imagen_url: null,
  grupos_opcion: [],
  ...over,
});

const withSize = product(9, {
  grupos_opcion: [
    { id: 1, nombre: 'Tamaño', min_selecciones: 1, max_selecciones: 1, opciones: [{ id: 11, nombre: 'Chico', precio_extra: '0' }, { id: 12, nombre: 'Grande', precio_extra: '8.00' }] },
    { id: 2, nombre: 'Extras', min_selecciones: 0, max_selecciones: 2, opciones: [{ id: 21, nombre: 'Queso', precio_extra: '5' }, { id: 22, nombre: 'Jamón', precio_extra: '6' }, { id: 23, nombre: 'Chile', precio_extra: '0' }] },
  ],
});

describe('Caja › Alumnos', () => {
  it('puede gastar lo menor entre su saldo y lo que le falta del tope', () => {
    expect(spendableCents(card())).toBe(10000);
    expect(spendableCents(card({ gastado_hoy: '70.50' }))).toBe(2950);
    expect(spendableCents(card({ gastado_hoy: '150' }))).toBe(0);
    expect(spendableCents(card({ saldo: '12.00' }))).toBe(1200);
    expect(spendableCents(card({ limite_diario: null }))).toBe(53300);
    expect(spendableCents(card({ saldo: '-5' , limite_diario: null }))).toBe(0);
  });

  it('dice por qué no se le vende, en el orden de Expo', () => {
    expect(blockReason(product(1), card())).toBe('No lo autorizó su tutor');
    expect(blockReason(product(5, { categoria_id: 20 }), card())).toBe('Categoría no autorizada');
    expect(blockReason(product(2), card())).toBe('Tiene un alérgeno del alumno');
    expect(blockReason(product(3), card())).toBe('Sin alérgenos revisados');
    expect(blockReason(product(4), card())).toBeNull();
  });

  it('nombres, identidad y alergias se leen como en la caja', () => {
    expect(firstName(card())).toBe('Lia');
    expect(studentIdentity(card())).toBe('KAO-211 · 1A');
    expect(studentIdentity(card({ matricula: null, grupo: null }))).toBe('');
    expect(allergyBanner(['huevo', 'lacteos', 'kiwi'])).toBe('Alérgico a huevo, lácteos, kiwi');
    expect(allergyBanner([])).toBeNull();
  });

  it('las opciones obligatorias se eligen antes y respetan el máximo del grupo', () => {
    expect(needsChoice(withSize)).toBe(true);
    expect(needsChoice(product(4))).toBe(false);
    expect(defaultChoices(withSize)).toEqual([11]);
    expect(toggleChoice(withSize, [11], 12)).toEqual([12]);
    expect(toggleChoice(withSize, [12], 12)).toEqual([12]);
    expect(toggleChoice(withSize, [12, 21, 22], 23)).toEqual([12, 21, 22]);
    expect(toggleChoice(withSize, [12, 21], 21)).toEqual([12]);
  });

  it('suma precio de mostrador más extras por cantidad y arma lo que se manda', () => {
    const cart = stepCart(stepCart(stepCart({}, 9, 1), 9, 1), 4, 1);
    const choices = { 9: [12, 21] };
    expect(cartTotalCents(cart, [withSize, product(4)], choices)).toBe((2550 + 800 + 500) * 2 + 2550);
    expect(purchaseItems(cart, choices)).toEqual([
      { producto_id: 4, cantidad: 1, opcion_ids: [] },
      { producto_id: 9, cantidad: 2, opcion_ids: [12, 21] },
    ]);
    expect(stepCart({ 4: 1 }, 4, -1)).toEqual({});
    expect(stepCart({ 4: 10 }, 4, 1)).toEqual({ 4: 10 });
  });

  it('con PIN de su tutor pide sus 4 números', () => {
    expect(pinReady(card(), '')).toBe(true);
    expect(pinReady(card({ pide_pin: true }), '12')).toBe(false);
    expect(pinReady(card({ pide_pin: true }), '1234')).toBe(true);
  });
});
