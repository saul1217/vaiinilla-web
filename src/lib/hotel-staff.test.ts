import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { HOTEL_STAFF_ENABLED } from './hotel-staff-feature';
import {
  RetryKeys,
  addDays,
  checkoutBreakdown,
  floorShown,
  freeRooms,
  hotelDateRange,
  hotelMoney,
  hotelMoneyShort,
  hotelRoomNumber,
  nextFloor,
  parseAmount,
  receptionSections,
  requestSubtitle,
  requestTitle,
  roomTone,
  staffErrorMessage,
  stayCodeLabel,
  visibleRooms,
} from './hotel-staff';
import { requestFixture, roomFixture, stayFixture } from '../test/hotel-fixtures';

const apiError = (status: number, code: string) => new VaiinillaApiError(status, { code, message: `mensaje ${code}` });

describe('bandera del personal de hotel', () => {
  it('viene apagada por defecto', () => {
    expect(HOTEL_STAFF_ENABLED).toBe(false);
  });
});

describe('parseAmount (igual que Android)', () => {
  it.each([
    ['90', '90.00'],
    ['90.5', '90.50'],
    ['1,250.75', '1250.75'],
    ['$90', '90.00'],
    ['007.1', '7.10'],
  ])('%s → %s', (input, output) => expect(parseAmount(input)).toBe(output));

  it.each(['', '0', '0.00', '-5', '1.234', 'abc', '1.2.3'])('rechaza «%s»', (input) => expect(parseAmount(input)).toBeNull());
});

describe('formatos', () => {
  it('dinero y fechas como en Android', () => {
    expect(hotelMoney('4950')).toBe('$4,950.00');
    expect(hotelMoney(null)).toBe('$0.00');
    expect(hotelMoneyShort('1650.00')).toBe('$1,650');
    expect(hotelDateRange('2026-11-06', '2026-11-09')).toBe('6 al 9 de nov');
    expect(hotelDateRange('2026-10-30', '2026-11-02')).toBe('30 de oct al 2 de nov');
    expect(hotelDateRange('2026-11-06', null)).toBe('6 de nov');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(hotelRoomNumber('Habitación 304')).toBe('304');
    expect(hotelRoomNumber('Suite')).toBe('Suite');
    expect(stayCodeLabel('482915')).toBe('482 915');
  });
});

describe('Recepción', () => {
  it('separa salen hoy, en casa y por llegar con el día del hotel', () => {
    const leaving = stayFixture({ id: 'a', salida: '2026-11-12' });
    const overdue = stayFixture({ id: 'b', salida: '2026-11-11' });
    const staying = stayFixture({ id: 'c', salida: '2026-11-15' });
    const arriving = stayFixture({ id: 'd', estado: 'reservada' });
    const gone = stayFixture({ id: 'e', estado: 'salio' });
    const sections = receptionSections([leaving, overdue, staying, arriving, gone], '2026-11-12');
    expect(sections.leavingToday.map((s) => s.id)).toEqual(['a', 'b']);
    expect(sections.staying.map((s) => s.id)).toEqual(['c']);
    expect(sections.arriving.map((s) => s.id)).toEqual(['d']);
  });

  it('solo ofrece habitaciones libres, en orden natural', () => {
    const rooms = [roomFixture({ id: 10, nombre: 'Habitación 10' }), roomFixture({ id: 2, nombre: 'Habitación 2' }), roomFixture({ id: 3, nombre: 'Habitación 3', ocupada: true })];
    expect(freeRooms(rooms).map((room) => room.id)).toEqual([2, 10]);
  });

  it('la cuenta suma noches, room service por cobrar y agrupa cargos; el total es el del servidor', () => {
    const stay = stayFixture({
      noches: 3,
      tarifa_noche: '1650.00',
      pedidos: [
        { id: 'p1', folio: 'A-1', estado: 'entregado', total: '200.00', items_resumen: null, por_cobrar: true, creado_en: null },
        { id: 'p2', folio: 'A-2', estado: 'entregado', total: '99.00', items_resumen: null, por_cobrar: false, creado_en: null },
      ],
      cargos: [
        { id: 1, concepto: 'Agua', categoria: 'minibar', monto: '40.00', creado_en: null },
        { id: 2, concepto: 'Botana', categoria: 'minibar', monto: '45.50', creado_en: null },
        { id: 3, concepto: 'Lavandería', categoria: 'otro', monto: '120.00', creado_en: null },
      ],
      cuenta: { noches_total: '4950.00', cargos_total: '205.50', pedidos_total: '200.00', total: '5355.50', pedidos_pendientes: 1 },
    });
    const bill = checkoutBreakdown(stay);
    expect(bill.stayAmount).toBe('4950.00');
    expect(bill.roomServiceCount).toBe(1);
    expect(bill.roomServiceTotal).toBe('200.00');
    expect(bill.charges).toEqual([{ label: 'Minibar', amount: '85.50' }, { label: 'Lavandería', amount: '120.00' }]);
    expect(bill.total).toBe('5355.50');
  });
});

describe('ama de llaves', () => {
  const rooms = [
    roomFixture({ id: 101, nombre: 'Habitación 101', piso: 1 }),
    roomFixture({ id: 201, nombre: 'Habitación 201', piso: 2, limpieza: 'por_limpiar' }),
    roomFixture({ id: 202, nombre: 'Habitación 202', piso: 2, ocupada: true }),
    roomFixture({ id: 900, nombre: 'Cabaña', piso: null }),
  ];

  it('el tono sigue el orden de Android: no molestar, ocupada, por limpiar, lista', () => {
    expect(roomTone(roomFixture({ ocupada: true, no_molestar: true }))).toBe('no_molestar');
    expect(roomTone(roomFixture({ ocupada: true, limpieza: 'por_limpiar' }))).toBe('ocupada');
    expect(roomTone(roomFixture({ limpieza: 'por_limpiar' }))).toBe('por_limpiar');
    expect(roomTone(roomFixture())).toBe('lista');
  });

  it('abre en el primer piso con trabajo y pasa al siguiente al tocarlo', () => {
    expect(floorShown(rooms, null)).toBe(2);
    expect(nextFloor(rooms, null)).toBe(1);
    expect(floorShown(rooms, 1)).toBe(1);
  });

  it('una habitación sin piso se ve en todos y los filtros cuadran', () => {
    expect(visibleRooms(rooms, 'todas', 1).map((room) => room.id)).toEqual([900, 101]);
    expect(visibleRooms(rooms, 'sucias', 2).map((room) => room.id)).toEqual([201]);
    expect(visibleRooms(rooms, 'limpias', 2).map((room) => room.id)).toEqual([900]);
    expect(visibleRooms(rooms, 'ocupadas', 2).map((room) => room.id)).toEqual([202]);
  });

  it('las solicitudes dicen cuarto, cantidad, antigüedad y quién la tomó', () => {
    const now = new Date('2026-11-12T15:06:00.000Z');
    expect(requestTitle(requestFixture())).toBe('304 · 2 toallas');
    expect(requestTitle(requestFixture({ cantidad: 1, tipo: 'limpieza' }))).toBe('304 · Limpieza');
    expect(requestSubtitle(requestFixture({ nota: 'Después de las 11:00' }), now)).toBe('Pedido hace 6 min · Después de las 11:00');
    expect(requestSubtitle(requestFixture({ estado: 'tomada', tomada_por: { usuario_id: 'u', nombre: 'Rosa' } }), now)).toBe('Tomada por Rosa');
  });
});

describe('errores y llaves de reintento', () => {
  it('traduce los códigos del servidor con las palabras de Android', () => {
    expect(staffErrorMessage(apiError(409, 'ACCOUNT_TOTAL_CHANGED'), 'x')).toMatch(/La cuenta cambió/);
    expect(staffErrorMessage(apiError(409, 'REQUEST_VERSION_CONFLICT'), 'x')).toBe('Otra persona ya atendió esta solicitud. Ya está al día.');
    expect(staffErrorMessage(apiError(409, 'ESTABLISHMENT_NOT_RECEIVING'), 'x')).toMatch(/Abre la caja/);
    expect(staffErrorMessage(apiError(403, 'FORBIDDEN_ROLE'), 'x')).toBe('Solo Caja puede hacer esto.');
    expect(staffErrorMessage(new TypeError('Failed to fetch'), 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });

  it('repite la llave tras un fallo de red y la cambia cuando el servidor ya contestó', () => {
    const keys = new RetryKeys();
    const first = keys.keyFor('charge', 'stay-1', { monto: '90.00' });
    keys.settle(new TypeError('Failed to fetch'), 'charge', 'stay-1', { monto: '90.00' });
    expect(keys.keyFor('charge', 'stay-1', { monto: '90.00' })).toBe(first);
    keys.settle(null, 'charge', 'stay-1', { monto: '90.00' });
    expect(keys.keyFor('charge', 'stay-1', { monto: '90.00' })).not.toBe(first);
    expect(keys.keyFor('charge', 'stay-2', { monto: '90.00' })).not.toBe(first);
  });

  it.each([408, 429, 500, 503])('con %i el reintento usa la misma llave: el cargo pudo haberse aplicado', (status) => {
    const keys = new RetryKeys();
    const first = keys.keyFor('charge', 'stay-1', { monto: '90.00' });
    keys.settle(apiError(status, status === 429 ? 'RATE_LIMITED' : 'TIMEOUT'), 'charge', 'stay-1', { monto: '90.00' });
    expect(keys.keyFor('charge', 'stay-1', { monto: '90.00' })).toBe(first);
  });

  it.each([400, 403, 404, 409, 422])('con %i (respuesta final) el siguiente intento lleva llave nueva', (status) => {
    const keys = new RetryKeys();
    const first = keys.keyFor('charge', 'stay-1', { monto: '90.00' });
    keys.settle(apiError(status, 'VALIDATION_ERROR'), 'charge', 'stay-1', { monto: '90.00' });
    expect(keys.keyFor('charge', 'stay-1', { monto: '90.00' })).not.toBe(first);
  });
});
