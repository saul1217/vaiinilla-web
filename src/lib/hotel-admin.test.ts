import { describe, expect, it } from 'vitest';
import { settingsFixture, summaryFixture } from '../test/hotel-fixtures';
import type { HotelRoom } from '../types/api';
import {
  DEFAULT_ROOM_BATCH,
  batchCount,
  batchInput,
  batchNotice,
  batchProblem,
  clockInput,
  createLabel,
  departuresDetail,
  hotelKeys,
  kitchenNow,
  oldestRequestMinutes,
  padClock,
  priceInput,
  roomDetail,
  roomQrLines,
  sameSettings,
  settingsInput,
  settingsProblem,
  sortRooms,
} from './hotel-admin';

const room = (patch: Partial<HotelRoom>): HotelRoom => ({
  id: 1, nombre: 'Habitación 1', piso: null, categoria: null, limpieza: 'lista', ocupada: false, no_molestar: false,
  estancia: null, solicitudes_abiertas: 0, pedidos_en_curso: 0, ...patch,
});

const departure = (nombre: string) => ({ estancia_id: nombre, huesped_nombre: 'Ana', habitacion: { id: 1, nombre }, salida_prevista: null });

describe('resumen del hotel', () => {
  it('cuenta los minutos de la solicitud más vieja contra la hora del resumen', () => {
    expect(oldestRequestMinutes(summaryFixture())).toBe(15);
    expect(oldestRequestMinutes(summaryFixture({ solicitudes: { abiertas: 0, mas_vieja_desde: null } }))).toBeNull();
  });

  it('dice cuántos hay en cocina como Android', () => {
    expect(kitchenNow(0)).toBe('Cocina libre');
    expect(kitchenNow(1)).toBe('1 en cocina ahora');
    expect(kitchenNow(3)).toBe('3 en cocina ahora');
  });

  it('nombra las habitaciones que salen hoy sin el prefijo', () => {
    expect(departuresDetail(summaryFixture({ salidas_hoy: [departure('Habitación 304')] }))).toBe('304 hace check-out');
    expect(departuresDetail(summaryFixture({ salidas_hoy: ['Habitación 304', 'Habitación 112', 'Habitación 408'].map(departure) })))
      .toBe('304, 112 y 408 hacen check-out');
    expect(departuresDetail(summaryFixture())).toBe('Habitaciones que hacen check-out');
  });
});

describe('habitaciones', () => {
  it('cuenta, valida y arma el lote igual que el servidor', () => {
    expect(batchCount(DEFAULT_ROOM_BATCH)).toBe(10);
    expect(batchProblem(DEFAULT_ROOM_BATCH)).toBeNull();
    expect(batchProblem({ ...DEFAULT_ROOM_BATCH, prefix: '  ' })).toBe('El nombre base va de 1 a 70 letras.');
    expect(batchProblem({ ...DEFAULT_ROOM_BATCH, from: '20', to: '10' })).toBe('El último número debe ser mayor o igual al primero.');
    expect(batchProblem({ ...DEFAULT_ROOM_BATCH, from: '1', to: '501' })).toBe('Se crean hasta 500 a la vez.');
    expect(batchProblem({ ...DEFAULT_ROOM_BATCH, from: '' })).toBe('Los números van de 0 a 99999.');
    expect(batchInput({ ...DEFAULT_ROOM_BATCH, prefix: ' Cuarto ', category: ' Doble ' }))
      .toEqual({ prefijo: 'Cuarto', desde: 101, hasta: 110, piso: 1, categoria: 'Doble' });
    expect(batchInput({ ...DEFAULT_ROOM_BATCH, floor: '', category: '' })).toEqual({ prefijo: 'Habitación', desde: 101, hasta: 110 });
  });

  it('usa los textos de Android para el botón y el aviso', () => {
    expect(createLabel(0)).toBe('Crear habitaciones con QR');
    expect(createLabel(1)).toBe('Crear 1 habitación con QR');
    expect(createLabel(10)).toBe('Crear 10 habitaciones con QR');
    expect(batchNotice({ creadas: 8, convertidas: 1, omitidas: ['a', 'b'] })).toBe('Se crearon 8 habitaciones (2 ya existían), 1 mesas pasaron a habitación');
  });

  it('ordena «Habitación 2» antes que «Habitación 10» y describe cada fila', () => {
    const sorted = sortRooms([room({ id: 1, nombre: 'Habitación 10' }), room({ id: 2, nombre: 'Habitación 2' })]);
    expect(sorted.map((item) => item.nombre)).toEqual(['Habitación 2', 'Habitación 10']);
    expect(roomDetail(room({ piso: 3, categoria: 'doble' }))).toBe('Piso 3 · Doble · QR activo');
    expect(roomDetail(room({ ocupada: true }))).toBe('ocupada');
    expect(roomQrLines([room({ nombre: 'Habitación 1', qr_url: 'https://q/1' }), room({ nombre: 'Habitación 2' })])).toBe('Habitación 1: https://q/1');
  });
});

describe('ajustes', () => {
  it('limpia horas y montos mientras se escriben', () => {
    expect(clockInput('7a:30x9')).toBe('7:309');
    expect(padClock('7:30')).toBe('07:30');
    expect(padClock('17:30')).toBe('17:30');
    expect(priceInput('1a50.5.9')).toBe('150.59');
  });

  it('rechaza horario de cocina a medias, igual o mal escrito', () => {
    expect(settingsProblem(settingsFixture())).toBeNull();
    expect(settingsProblem(settingsFixture({ cocina_desde: '07:00' }))).toMatch(/dos horas/);
    expect(settingsProblem(settingsFixture({ cocina_desde: '7:00', cocina_hasta: '07:00' }))).toMatch(/misma hora/);
    expect(settingsProblem(settingsFixture({ hora_checkout: '25:00' }))).toMatch(/hora de salida/);
    expect(settingsProblem(settingsFixture({ salida_tardia_hora: '15:00', salida_tardia_precio: '150.' }))).toBeNull();
  });

  it('manda el cuerpo sin activo, con horas de dos cifras y sin hora_checkout null', () => {
    const body = settingsInput(settingsFixture({ cocina_desde: '7:00', cocina_hasta: '23:00', hora_checkout: null, salida_tardia_hora: '15:00', salida_tardia_precio: '150.' }));
    expect(body).not.toHaveProperty('activo');
    expect(body).not.toHaveProperty('hora_checkout');
    expect(body).toMatchObject({ cocina_desde: '07:00', cocina_hasta: '23:00', salida_tardia_hora: '15:00', salida_tardia_precio: '150.00' });
    expect(settingsInput(settingsFixture({ salida_tardia_precio: '80' })).salida_tardia_precio).toBe('80.00');
    expect(sameSettings(settingsFixture(), settingsFixture())).toBe(true);
    expect(sameSettings(settingsFixture(), settingsFixture({ tarjeta_al_pedir: false }))).toBe(false);
  });

  it('separa la caché por negocio', () => {
    expect(hotelKeys('a').settings).not.toEqual(hotelKeys('b').settings);
  });
});
