import { describe, expect, it } from 'vitest';
import { parseHourlyPrice } from './hourly-price';

describe('parseHourlyPrice', () => {
  it('normaliza montos válidos a dos decimales', () => {
    expect(parseHourlyPrice('300')).toBe('300.00');
    expect(parseHourlyPrice(' $350.5 ')).toBe('350.50');
  });
  it('vacío significa sin precio', () => {
    expect(parseHourlyPrice('')).toBeNull();
  });
  it('rechaza cero, negativos y texto', () => {
    expect(parseHourlyPrice('0')).toBeUndefined();
    expect(parseHourlyPrice('-5')).toBeUndefined();
    expect(parseHourlyPrice('abc')).toBeUndefined();
    expect(parseHourlyPrice('1.234')).toBeUndefined();
    expect(parseHourlyPrice('123456')).toBeUndefined();
  });
});
