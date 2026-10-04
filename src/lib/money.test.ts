import { describe, expect, it } from 'vitest';
import { calculateChange, normalizeMoneyInput } from './money';

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
