import { describe, expect, it } from 'vitest';
import { clock, spaceStatusLine } from './space-status';

const fin = '2026-10-01T19:00:00Z';
const reserva = { inicio: '2026-10-01T20:00:00Z', fin: '2026-10-01T21:00:00Z', estado: 'confirmada' };

describe('estado del espacio para el personal', () => {
  it('dice hasta cuándo dura el turno y si ya hay otra reserva', () => {
    expect(spaceStatusLine({ estado: 'ocupada', fin_previsto: fin, proxima_reserva: null })).toBe(`Hasta ${clock(fin)}`);
    expect(spaceStatusLine({ estado: 'ocupada', fin_previsto: fin, proxima_reserva: reserva })).toBe(
      `Hasta ${clock(fin)} · Reservada ${clock(reserva.inicio)}`,
    );
  });

  it('una mesa sin turno solo está ocupada', () => {
    expect(spaceStatusLine({ estado: 'ocupada', fin_previsto: null, proxima_reserva: null })).toBe('Ocupada');
  });

  it('avisa la cuenta pendiente y una cancha libre pero apartada', () => {
    expect(spaceStatusLine({ estado: 'por_cobrar', fin_previsto: fin, proxima_reserva: null })).toBe('Cuenta por cobrar');
    expect(spaceStatusLine({ estado: 'libre', fin_previsto: null, proxima_reserva: reserva })).toBe(`Reservada ${clock(reserva.inicio)}`);
    expect(spaceStatusLine({ estado: 'libre', fin_previsto: null, proxima_reserva: null })).toBe('Libre');
  });
});
