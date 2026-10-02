import { describe, expect, it } from 'vitest';
import { customerCounterPrice } from './catalog-pricing';

describe('precio que paga el cliente', () => {
  it.each(['20.00', '30.00', '45.00', '100.00', '100.01'])('%s se cobra exactamente igual, sin recargo', (price) => {
    expect(customerCounterPrice(price)).toBe(price);
  });

  it('rechaza dinero sin dos decimales', () => {
    expect(customerCounterPrice('20')).toBeNull();
  });
});
