import { describe, expect, it } from 'vitest';
import { calculateDigitalPrice } from './catalog-pricing';

describe('vista previa del precio digital', () => {
  it.each([
    ['20.00', '26.00'],
    ['30.00', '36.00'],
    ['45.00', '53.00'],
  ])('calcula %s como %s', (counterPrice, expected) => {
    expect(calculateDigitalPrice(counterPrice)).toBe(expected);
  });

  it('rechaza dinero sin dos decimales', () => {
    expect(calculateDigitalPrice('20')).toBeNull();
  });
});
