import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import {
  DEFAULT_MAX_PLAYERS,
  bookingWho,
  bowlingErrorMessage,
  canEditLanes,
  canRentLanes,
  canRequestRental,
  capacityLabel,
  durationLabel,
  isBowling,
  laneBatchCount,
  laneBatchInput,
  laneDetail,
  laneDurations,
  laneStatus,
  lanesOf,
  liveBookings,
  maxPlayers,
  parseCapacity,
  playersLabel,
  renewalStart,
  rentalChange,
  rentalPrice,
  stepPlayers,
} from './bowling-admin';
import type { BookingCourt, ManagedSpace, StaffBooking } from '../types/api';

const court = (patch: Partial<BookingCourt> = {}): BookingCourt => ({
  espacio: { id: 1, nombre: 'Pista 1', tipo: 'cancha' },
  precio_hora: '300.00',
  rentable: true,
  capacidad: 6,
  duraciones_min: [60, 120, 180],
  ocupado: [],
  ...patch,
});

describe('boliche: tipo y roles', () => {
  it('solo un negocio de tipo boliche usa la página', () => {
    expect(isBowling({ tipo_establecimiento: 'boliche' })).toBe(true);
    expect(isBowling({ tipo_establecimiento: 'padel' })).toBe(false);
    expect(isBowling({ tipo_establecimiento: null })).toBe(false);
    expect(isBowling(undefined)).toBe(false);
  });

  it('admin edita pistas; admin, Caja y mesero rentan; cocina no', () => {
    expect(canEditLanes('admin')).toBe(true);
    expect(canEditLanes('cajero')).toBe(false);
    expect(['admin', 'cajero', 'mesero'].every(canRentLanes)).toBe(true);
    expect(canRentLanes('cocina')).toBe(false);
  });
});

describe('boliche: jugadores y capacidad (R11, R25)', () => {
  it('el tope es la capacidad de la pista, o 30 sin capacidad', () => {
    expect(maxPlayers(court())).toBe(6);
    expect(maxPlayers(court({ capacidad: null }))).toBe(DEFAULT_MAX_PLAYERS);
  });

  it('el selector no baja de 0 ni pasa de la capacidad', () => {
    expect(stepPlayers(0, -1, 6)).toBe(0);
    expect(stepPlayers(6, 1, 6)).toBe(6);
    expect(stepPlayers(3, 1, 6)).toBe(4);
  });

  it('rentar ahora pide al menos un jugador; renovar hereda los del turno', () => {
    expect(canRequestRental(0, 6, false)).toBe(false);
    expect(canRequestRental(1, 6, false)).toBe(true);
    expect(canRequestRental(7, 6, false)).toBe(false);
    expect(canRequestRental(0, 6, true)).toBe(true);
  });

  it('textos de jugadores y capacidad como en Android', () => {
    expect(playersLabel(0)).toBe('Sin anotar');
    expect(playersLabel(1)).toBe('1 jugador');
    expect(playersLabel(4)).toBe('4 jugadores');
    expect(capacityLabel(6)).toBe('Caben 6 jugadores');
    expect(capacityLabel(null)).toBe('Hasta 30 jugadores (sin capacidad)');
  });

  it('la capacidad va de 1 a 99 o vacía', () => {
    expect(parseCapacity('')).toBeNull();
    expect(parseCapacity(' 8 ')).toBe(8);
    expect(parseCapacity('0')).toBeUndefined();
    expect(parseCapacity('100')).toBeUndefined();
    expect(parseCapacity('6.5')).toBeUndefined();
  });
});

describe('boliche: turnos y precio', () => {
  it('duraciones de la pista, o las del negocio, ordenadas y sin repetir', () => {
    expect(laneDurations(court({ duraciones_min: [120, 60, 60] }), { duraciones_min: [90] })).toEqual([60, 120]);
    expect(laneDurations(court({ duraciones_min: [] }), { duraciones_min: [60, 180] })).toEqual([60, 180]);
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(90)).toBe('1 h 30');
    expect(durationLabel(30)).toBe('30 min');
  });

  it('el precio es por hora por la duración', () => {
    expect(rentalPrice('300.00', 60)).toBe('300.00');
    expect(rentalPrice('300.00', 90)).toBe('450.00');
    expect(rentalPrice('125.50', 120)).toBe('251.00');
    expect(rentalPrice(null, 60)).toBeNull();
  });

  it('una pista está en turno si lo ocupado cubre ahora, reservada si hay algo después y libre si no', () => {
    const now = new Date('2026-11-10T20:00:00Z');
    const busy = court({ ocupado: [{ inicio: '2026-11-10T19:30:00Z', fin: '2026-11-10T20:30:00Z', motivo: 'turno' }] });
    expect(laneStatus(busy, now)).toEqual({ state: 'en_turno', until: '2026-11-10T20:30:00Z', next: null });
    const later = court({ ocupado: [{ inicio: '2026-11-10T21:00:00Z', fin: '2026-11-10T22:00:00Z', motivo: 'reserva' }] });
    expect(laneStatus(later, now).state).toBe('reservada');
    expect(laneStatus(court(), now).state).toBe('libre');
    expect(laneStatus(court({ precio_hora: null, rentable: false }), now).state).toBe('sin_precio');
    const closed = court({ ocupado: [{ inicio: '2026-11-10T14:00:00Z', fin: '2026-11-11T05:00:00Z', motivo: 'cerrado' }] });
    expect(laneStatus(closed, now).state).toBe('cerrada');
  });

  it('el tablero de espacios manda el fin del turno, y con él se renueva', () => {
    const now = new Date('2026-11-10T20:00:00Z');
    const board = { estado: 'ocupada' as const, fin_previsto: '2026-11-10T21:00:00Z' };
    expect(laneStatus(court(), now, board)).toMatchObject({ state: 'en_turno', until: '2026-11-10T21:00:00Z' });
    expect(renewalStart(board)).toBe('2026-11-10T21:00:00Z');
    expect(renewalStart({ estado: 'libre', fin_previsto: null })).toBeNull();
    expect(renewalStart({ estado: 'ocupada', fin_previsto: null })).toBeNull();
  });
});

describe('boliche: cobro', () => {
  it('el cambio sale solo si el efectivo alcanza', () => {
    expect(rentalChange('500', '450.00')).toBe('50.00');
    expect(rentalChange('400', '450.00')).toBeNull();
    expect(rentalChange('abc', '450.00')).toBeNull();
  });

  it('traduce los errores del servidor; la capacidad usa el texto del servidor', () => {
    const required = new VaiinillaApiError(422, { code: 'PLAYERS_REQUIRED', message: 'x' });
    expect(bowlingErrorMessage(required)).toBe('Indica cuántos van a jugar para rentar la pista.');
    const over = new VaiinillaApiError(422, { code: 'PLAYERS_OVER_CAPACITY', message: 'En Pista 1 caben hasta 6 jugadores.' });
    expect(bowlingErrorMessage(over)).toBe('En Pista 1 caben hasta 6 jugadores.');
    const noCash = new VaiinillaApiError(422, { code: 'ESTABLISHMENT_NOT_RECEIVING', message: 'x' });
    expect(bowlingErrorMessage(noCash)).toContain('sesión de caja abierta');
  });
});

describe('boliche: turnos del día', () => {
  const booking = (patch: Partial<StaffBooking>): StaffBooking => ({ id: 'r', inicio: '2026-11-10T20:00:00Z', fin: '2026-11-10T21:00:00Z', estado: 'confirmada', ...patch });

  it('quita canceladas y expiradas y ordena por hora', () => {
    const list = liveBookings([
      booking({ id: 'b', inicio: '2026-11-10T22:00:00Z' }),
      booking({ id: 'x', estado: 'cancelada' }),
      booking({ id: 'a', inicio: '2026-11-10T19:00:00Z' }),
      booking({ id: 'y', estado: 'expirada' }),
    ]);
    expect(list.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('dice a nombre de quién y cuántos juegan', () => {
    expect(bookingWho({ nombre_cliente: 'Ana', jugadores: 4 })).toBe('Ana · 4 jugadores');
    expect(bookingWho({ cliente: { nombre: 'Luis' }, jugadores: null })).toBe('Luis');
    expect(bookingWho({})).toBe('');
  });
});

describe('boliche: pistas del admin', () => {
  const space = (patch: Partial<ManagedSpace>): ManagedSpace => ({ id: 1, nombre: 'Pista 1', tipo: 'cancha', activo: true, qr_url: '', precio_hora: '300.00', ...patch });

  it('las pistas son las canchas, en orden natural', () => {
    const list = lanesOf([space({ id: 3, nombre: 'Pista 10' }), space({ id: 2, nombre: 'Mesa 1', tipo: 'mesa' }), space({ id: 1, nombre: 'Pista 2' })]);
    expect(list.map((item) => item.nombre)).toEqual(['Pista 2', 'Pista 10']);
  });

  it('detalle con precio, capacidad y si está apagada', () => {
    expect(laneDetail(space({ capacidad: 6 }))).toBe('Renta $300.00 MXN por hora · Caben 6 jugadores');
    expect(laneDetail(space({ precio_hora: null, capacidad: null, activo: false }))).toBe('Sin precio: no se renta · Hasta 30 jugadores (sin capacidad) · Apagada');
  });

  it('el lote de pistas va como cancha con capacidad opcional', () => {
    expect(laneBatchCount({ prefix: 'Pista', from: '1', to: '6', capacity: '' })).toBe(6);
    expect(laneBatchCount({ prefix: 'Pista', from: '6', to: '1', capacity: '' })).toBe(0);
    expect(laneBatchInput({ prefix: ' Pista ', from: '1', to: '6', capacity: '8' })).toEqual({
      ok: true,
      input: { tipo: 'cancha', prefijo: 'Pista', desde: 1, hasta: 6, capacidad: 8 },
    });
    expect(laneBatchInput({ prefix: 'Pista', from: '1', to: '2', capacity: '' })).toEqual({
      ok: true,
      input: { tipo: 'cancha', prefijo: 'Pista', desde: 1, hasta: 2 },
    });
    expect(laneBatchInput({ prefix: '', from: '1', to: '2', capacity: '' }).ok).toBe(false);
    expect(laneBatchInput({ prefix: 'Pista', from: '1', to: '2', capacity: '120' }).ok).toBe(false);
  });
});
