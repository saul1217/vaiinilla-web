import { describe, expect, it } from 'vitest';
import { calculateChange, moneyToCents, normalizeMoneyInput } from './money';

describe('montos del POS', () => {
  it('normaliza al perder el foco o pegar: 200 → 200.00', () => {
    expect(normalizeMoneyInput('200')).toBe('200.00');
    expect(normalizeMoneyInput('200.5')).toBe('200.50');
    expect(normalizeMoneyInput('200.00')).toBe('200.00');
    expect(normalizeMoneyInput(' 200 ')).toBe('200.00');
    expect(normalizeMoneyInput('abc')).toBe('abc');
  });

  it('el cambio se calcula con el monto normalizado', () => {
    expect(calculateChange(normalizeMoneyInput('200'), '120.00')).toBe('80.00');
    expect(calculateChange('200.00', '120.00')).toBe('80.00');
    expect(calculateChange('100.00', '120.00')).toBeNull();
  });
});

describe('montos sin decimales', () => {
  it('acepta pesos enteros y con un decimal', () => {
    expect(moneyToCents('60')).toBe(6000n);
    expect(moneyToCents('60.5')).toBe(6050n);
    expect(moneyToCents('60.50')).toBe(6050n);
    expect(moneyToCents('60.505')).toBeNull();
    expect(moneyToCents('abc')).toBeNull();
  });

  it('calcula el cambio con pesos enteros', () => {
    expect(calculateChange('200', '120.50')).toBe('79.50');
  });
});
