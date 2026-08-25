import { describe, expect, it } from 'vitest';
import { calculateDigitalPrice } from './catalog-pricing';

describe('vista previa del precio único del cliente', () => {
  it.each([
    ['20.00', '22.00'],
    ['30.00', '33.00'],
    ['45.00', '49.50'],
    ['100.00', '110.00'],
  ])('calcula %s como %s', (counterPrice, expected) => {
    expect(calculateDigitalPrice(counterPrice)).toBe(expected);
  });

  it('redondea hacia arriba al centavo cuando es necesario', () => {
    expect(calculateDigitalPrice('100.01')).toBe('110.02');
  });

  it('rechaza dinero sin dos decimales', () => {
    expect(calculateDigitalPrice('20')).toBeNull();
  });
});
