import { describe, expect, it, vi } from 'vitest';
import { AGENDA_ENABLED } from './agenda-feature';
import {
  addDays,
  availableDurations,
  bookableDates,
  canCancel,
  canMove,
  cancelErrorMessage,
  freeStarts,
  MoveBookingError,
  moveBooking,
  needsRefund,
  refundSummary,
  releaseOrphan,
  type MoveDeps,
} from './agenda';
import { VaiinillaApiError } from './api-error';
import type { CourtAvailabilityCourt, CourtAvailabilityDay, StaffBooking } from '../types/api';

const court = (patch: Partial<CourtAvailabilityCourt> = {}): CourtAvailabilityCourt => ({
  espacio: { id: 7, nombre: 'Cancha 1', tipo: 'cancha' },
  precio_hora: '300.00',
  rentable: true,
  duraciones_min: [90, 180],
  ocupado: [],
  ...patch,
});

// 07:00 a 12:00 en UTC para que las cuentas se lean fácil.
const day = (patch: Partial<CourtAvailabilityDay> = {}): CourtAvailabilityDay => ({
  fecha: '2026-11-10',
  hoy: '2026-11-10',
  zona_horaria: 'UTC',
  apertura: '07:00',
  cierre: '12:00',
  abre: '2026-11-10T07:00:00.000Z',
  cierra: '2026-11-10T12:00:00.000Z',
  bloque_min: 30,
  duraciones_min: [90, 180],
  dias_adelanto: 2,
  ahora: '2026-11-10T06:00:00.000Z',
  canchas: [court()],
  ...patch,
});

const booking = (patch: Partial<StaffBooking> = {}): StaffBooking => ({
  id: 'r-1',
  espacio: { id: 7, nombre: 'Cancha 1' },
  inicio: '2099-11-10T08:00:00.000Z',
  fin: '2099-11-10T09:30:00.000Z',
  duracion_min: 90,
  monto: '450.00',
  estado: 'pendiente_pago',
  nombre_cliente: 'Ana',
  pedido_id: 'p-1',
  ...patch,
});

describe('bandera de la agenda', () => {
  it('viene apagada por defecto', () => {
    expect(AGENDA_ENABLED).toBe(false);
  });
});

describe('días y horarios', () => {
  it('suma días sin depender de la zona del navegador, también al cambiar de mes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(bookableDates({ hoy: '2026-11-10', dias_adelanto: 2 })).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('ofrece inicios donde cabe la duración más corta y no los que chocan con lo ocupado', () => {
    const busy = court({ ocupado: [{ inicio: '2026-11-10T08:00:00.000Z', fin: '2026-11-10T09:30:00.000Z', motivo: 'reserva' }] });
    const starts = freeStarts(day(), busy);
    expect(starts).not.toContain('2026-11-10T07:00:00.000Z'); // 07:00 + 90 choca con las 08:00
    expect(starts).not.toContain('2026-11-10T08:30:00.000Z');
    expect(starts).toContain('2026-11-10T09:30:00.000Z');
    expect(starts).toContain('2026-11-10T10:30:00.000Z');
    expect(starts).not.toContain('2026-11-10T11:00:00.000Z'); // no cabe antes del cierre
    expect(availableDurations(day(), busy, '2026-11-10T09:30:00.000Z')).toEqual([90]);
  });

  it('hoy no ofrece horarios que ya pasaron, y un día cerrado no ofrece nada', () => {
    expect(freeStarts(day({ ahora: '2026-11-10T09:10:00.000Z' }), court())[0]).toBe('2026-11-10T09:30:00.000Z');
    expect(freeStarts(day({ cerrado: true }), court())).toEqual([]);
    expect(freeStarts(day(), court({ rentable: false }))).toEqual([]);
  });
});

describe('qué se puede hacer con cada reserva', () => {
  it('mueve solo la pendiente que no ha empezado; cancela pendiente y pagada por empezar', () => {
    const now = Date.parse('2099-11-10T07:00:00.000Z');
    expect(canMove(booking(), now)).toBe(true);
    expect(canMove(booking({ estado: 'confirmada' }), now)).toBe(false);
    expect(canCancel(booking({ estado: 'confirmada' }), now)).toBe(true);
    expect(needsRefund(booking({ estado: 'confirmada' }))).toBe(true);
    const started = Date.parse('2099-11-10T08:30:00.000Z');
    expect(canCancel(booking({ estado: 'confirmada' }), started)).toBe(false);
    expect(canMove(booking(), started)).toBe(false);
    expect(canCancel(booking({ estado: 'en_curso' }), now)).toBe(false);
  });
});

describe('moveBooking', () => {
  const target = { espacio_id: 8, inicio: '2099-11-11T10:00:00.000Z', duracion_min: 180 };
  const apiError = (status: number, code: string, details?: unknown) => new VaiinillaApiError(status, { code, message: code, details });
  const deps = (patch: Partial<MoveDeps> = {}) => {
    const calls: string[] = [];
    let key = 0;
    const value: MoveDeps = {
      create: vi.fn(() => { calls.push('create'); return Promise.resolve({ id: 'r-2' }); }),
      markCashLater: vi.fn((id: string) => { calls.push(`cash:${id}`); return Promise.resolve(); }),
      cancel: vi.fn((id: string) => { calls.push(`cancel:${id}`); return Promise.resolve(); }),
      newKey: () => `k${++key}`,
      wait: vi.fn(() => Promise.resolve()),
      ...patch,
    };
    return { value, calls };
  };

  it('aparta el nuevo con el mismo nombre, lo deja por cobrar y al final cancela el original', async () => {
    const { value, calls } = deps();
    await expect(moveBooking(value, booking({ jugadores: 4 }), target)).resolves.toEqual({ id: 'r-2' });
    expect(value.create).toHaveBeenCalledWith({ ...target, nombre_cliente: 'Ana', jugadores: 4 });
    expect(calls).toEqual(['create', 'cash:r-2', 'cancel:r-1']);
  });

  it('un apartado sin pedido no se marca en efectivo', async () => {
    const { value, calls } = deps();
    await moveBooking(value, booking({ pedido_id: null, nombre_cliente: null }), target);
    expect(value.create).toHaveBeenCalledWith(target);
    expect(calls).toEqual(['create', 'cancel:r-1']);
  });

  it('si el horario nuevo está tomado no toca la original', async () => {
    const { value, calls } = deps({ create: vi.fn(() => Promise.reject(new Error('SLOT_TAKEN'))) });
    await expect(moveBooking(value, booking(), target)).rejects.toThrow('SLOT_TAKEN');
    expect(calls).toEqual([]);
  });

  it('si no se puede cancelar la original, suelta la nueva para no dejar dos', async () => {
    const cancel = vi.fn((id: string) => (id === 'r-1' ? Promise.reject(apiError(409, 'RESERVATION_NOT_CANCELLABLE', [{ estado_actual: 'en_curso' }])) : Promise.resolve()));
    const { value } = deps({ cancel });
    const error = await moveBooking(value, booking(), target).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MoveBookingError);
    expect((error as MoveBookingError).message).toBe('No se pudo soltar el horario original. La reserva sigue en su horario original.');
    expect((error as MoveBookingError).orphan).toBeUndefined();
    expect(cancel.mock.calls).toEqual([['r-1', 'k1'], ['r-2', 'k2']]);
  });

  it('reintenta cancelar la original con la misma llave si falla la red', async () => {
    let failures = 1;
    const cancel = vi.fn(() => (failures-- > 0 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve()));
    const { value } = deps({ cancel });
    await expect(moveBooking(value, booking(), target)).resolves.toEqual({ id: 'r-2' });
    expect(cancel.mock.calls).toEqual([['r-1', 'k1'], ['r-1', 'k1']]);
  });

  it('si no queda por cobrar, suelta la nueva y no cancela la original', async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const { value } = deps({ cancel, markCashLater: vi.fn(() => Promise.reject(apiError(500, 'INTERNAL'))) });
    await expect(moveBooking(value, booking(), target)).rejects.toThrow('No se pudo dejar el horario nuevo por cobrar en Caja. La reserva sigue en su horario original.');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('r-2', 'k1');
  });

  it('el undo que falla una vez se reintenta con la misma llave y el movimiento no se da por hecho', async () => {
    let undoFailures = 2;
    const cancel = vi.fn((id: string) => {
      if (id === 'r-1') return Promise.reject(apiError(409, 'RESERVATION_NOT_CANCELLABLE', [{ estado_actual: 'terminada' }]));
      return undoFailures-- > 0 ? Promise.reject(apiError(503, 'UNAVAILABLE')) : Promise.resolve();
    });
    const { value } = deps({ cancel });
    const error = await moveBooking(value, booking(), target).catch((caught: unknown) => caught) as MoveBookingError;
    expect(error).toBeInstanceOf(MoveBookingError);
    expect(error.orphan).toBeUndefined();
    expect(cancel.mock.calls).toEqual([['r-1', 'k1'], ['r-2', 'k2'], ['r-2', 'k2'], ['r-2', 'k2']]);
    expect(value.wait).toHaveBeenCalledTimes(2);
  });

  it('si el undo falla del todo, avisa que el horario nuevo quedó por cobrar en Caja y deja reintentar con la misma llave', async () => {
    const cancel = vi.fn((id: string) => Promise.reject(id === 'r-1'
      ? apiError(409, 'RESERVATION_NOT_CANCELLABLE', [{ estado_actual: 'en_curso' }])
      : new TypeError('Failed to fetch')));
    const { value } = deps({ cancel });
    const error = await moveBooking(value, booking(), target).catch((caught: unknown) => caught) as MoveBookingError;
    expect(error).toBeInstanceOf(MoveBookingError);
    expect(error.orphan).toEqual({ id: 'r-2', idempotencyKey: 'k2', byCash: true });
    expect(error.message).toMatch(/^No se movió la reserva: No se pudo soltar el horario original\./);
    expect(error.message).toContain('el horario nuevo también quedó apartado y está por cobrar en Caja. No lo cobres');
    expect(error.message).not.toContain('10 minutos');
    // Tres intentos del undo con la misma llave, y ninguno se da por hecho.
    expect(cancel.mock.calls.filter(([id]) => id === 'r-2')).toEqual([['r-2', 'k2'], ['r-2', 'k2'], ['r-2', 'k2']]);

    // Reintentar después usa la misma llave: si el primer intento sí llegó, el back no cancela dos veces.
    const retry = vi.fn(() => Promise.resolve());
    await releaseOrphan({ cancel: retry }, error.orphan!);
    expect(retry).toHaveBeenCalledExactlyOnceWith('r-2', 'k2');
  });

  it('si falló el efectivo y luego el undo, avisa que puede aparecer por cobrar', async () => {
    const cancel = vi.fn(() => Promise.reject(apiError(403, 'FORBIDDEN')));
    const { value, calls } = deps({ cancel, markCashLater: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) });
    const error = await moveBooking(value, booking(), target).catch((caught: unknown) => caught) as MoveBookingError;
    expect(error.orphan).toEqual({ id: 'r-2', idempotencyKey: 'k1', byCash: false });
    expect(error.message).toContain('y puede aparecer por cobrar en Caja');
    // Un 403 no se reintenta y la original nunca se cancela.
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['create']);
  });

  it('el undo da por suelta una nueva que ya estaba cancelada o vencida', async () => {
    for (const gone of [
      apiError(409, 'RESERVATION_NOT_CANCELLABLE', [{ estado_actual: 'cancelada' }]),
      apiError(409, 'RESERVATION_EXPIRED', [{ estado_actual: 'expirada' }]),
      apiError(404, 'RESERVATION_NOT_FOUND'),
    ]) {
      const { value } = deps({ cancel: vi.fn(() => Promise.reject(gone)), markCashLater: vi.fn(() => Promise.reject(apiError(500, 'X'))) });
      const error = await moveBooking(value, booking(), target).catch((caught: unknown) => caught) as MoveBookingError;
      expect(error.orphan).toBeUndefined();
      expect(error.message).toContain('La reserva sigue en su horario original.');
    }
  });
});

describe('reembolso al cancelar', () => {
  const refund = { id: 'rb', metodo: 'efectivo', monto: '150.00', monto_pagado: '450.00', salida: 'caja', creado_en: '2099-01-01T00:00:00.000Z' };

  it('describe la vía según la salida y el método que respondió el back', () => {
    expect(refundSummary(refund)).toEqual({
      amount: '$150.00 MXN de $450.00 MXN pagados (efectivo)',
      route: 'Sale en efectivo de la caja abierta: entrégalo al cliente.',
    });
    expect(refundSummary({ ...refund, monto: '0.00', salida: 'ninguna' }).route).toBe('Sin reembolso: solo quedó el registro con el motivo.');
    expect(refundSummary({ ...refund, metodo: 'saldo', salida: 'cartera', saldo_nuevo: '80.00' }).route).toBe('Regresó a la cartera del cliente. Su saldo ahora es $80.00 MXN.');
    expect(refundSummary({ ...refund, salida: 'devolucion_pendiente' }).route).toMatch(/No había caja abierta/);
    expect(refundSummary({ ...refund, metodo: 'tarjeta', salida: 'devolucion_pendiente' }).route).toBe('Quedó como devolución pendiente: Caja la confirma en Devoluciones.');
  });

  it('traduce los errores de cancelar y toma el tope de REFUND_AMOUNT_EXCEEDS_PAID', () => {
    expect(cancelErrorMessage('REFUND_AMOUNT_EXCEEDS_PAID', [{ monto_pagado: '400.00' }])).toBe('El reembolso no puede ser mayor a lo pagado ($400.00 MXN).');
    expect(cancelErrorMessage('REFUND_AMOUNT_EXCEEDS_PAID', undefined)).toBe('El reembolso no puede ser mayor a lo pagado.');
    expect(cancelErrorMessage('RESERVATION_NOT_CANCELLABLE', [{ estado_actual: 'cancelada' }])).toMatch(/ya estaba cancelada/);
    expect(cancelErrorMessage('REFUND_ALREADY_DONE', undefined)).toMatch(/ya se reembolsó/);
    expect(cancelErrorMessage('SLOT_TAKEN', undefined)).toBeNull();
  });
});
