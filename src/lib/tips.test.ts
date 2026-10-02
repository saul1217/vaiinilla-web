import { describe, expect, it } from 'vitest';
import { addMoney, tipAmount, tipForPercent } from './tips';

describe('propinas', () => {
  it('porcentaje redondeado al centavo', () => {
    expect(tipForPercent('150.50', 15)).toBe('22.58'); // 22.575 → 22.58
    expect(tipForPercent('100.00', 10)).toBe('10.00');
    expect(tipForPercent('33.33', 20)).toBe('6.67'); // 6.666 → 6.67
  });

  it('monto según la elección', () => {
    expect(tipAmount('100.00', { kind: 'none' })).toBe('0.00');
    expect(tipAmount('100.00', { kind: 'percent', percent: 20 })).toBe('20.00');
    expect(tipAmount('100.00', { kind: 'custom', amount: '12.50' })).toBe('12.50');
    expect(tipAmount('100.00', { kind: 'custom', amount: '12.5' })).toBe('0.00');
  });

  it('suma montos', () => {
    expect(addMoney('150.50', '22.58')).toBe('173.08');
  });
});
