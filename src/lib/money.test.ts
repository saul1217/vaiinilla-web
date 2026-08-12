import { describe, expect, it } from 'vitest';
import { calculateChange, centsToMoney, moneyToCents } from './money';

describe('money helpers', () => {
  it('convierte dinero sin usar flotantes', () => {
    expect(moneyToCents('725.50')).toBe(72550n);
    expect(centsToMoney(72550n)).toBe('725.50');
  });

  it('calcula el cambio exacto', () => {
    expect(calculateChange('100.00', '73.45')).toBe('26.55');
    expect(calculateChange('73.44', '73.45')).toBeNull();
  });

  it('rechaza montos que no respetan dos decimales', () => {
    expect(moneyToCents('10')).toBeNull();
    expect(moneyToCents('10.5')).toBeNull();
  });
});
