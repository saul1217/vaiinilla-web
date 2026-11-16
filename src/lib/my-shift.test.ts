import { describe, expect, it } from 'vitest';
import { responseLabel, shiftMoney, todayIso, weekBarHeights, weekdayLetter } from './my-shift';

describe('mi turno: presentación', () => {
  it('el dinero se lee con miles y sin MXN', () => {
    expect(shiftMoney('1180.50')).toBe('$1,180.50');
    expect(shiftMoney('0.00')).toBe('$0.00');
  });

  it('la inicial del día sale de la fecha local, empezando la semana en lunes', () => {
    expect(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(weekdayLetter))
      .toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(weekdayLetter('no-es-fecha')).toBe('');
  });

  it('las barras van contra el mejor día; sin propinas todas quedan en cero', () => {
    expect(weekBarHeights([{ propinas: '10.00' }, { propinas: '40.00' }, { propinas: '0.00' }])).toEqual([25, 100, 0]);
    expect(weekBarHeights([{ propinas: '0.00' }, { propinas: '0.00' }])).toEqual([0, 0]);
  });

  it('la respuesta a las llamadas se dice en minutos', () => {
    expect(responseLabel(null)).toBe('—');
    expect(responseLabel('0.4')).toBe('menos de 1 min');
    expect(responseLabel('2.5')).toBe('2.5 min');
    expect(responseLabel('3.0')).toBe('3 min');
  });

  it('hoy en el formato del servidor', () => {
    expect(todayIso(new Date(2026, 10, 16, 23, 30))).toBe('2026-11-16');
  });
});
