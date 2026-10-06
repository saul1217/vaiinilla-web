import { describe, expect, it } from 'vitest';
import { customerCounterPrice } from './catalog-pricing';

describe('precio que paga el cliente', () => {
  it.each(['20.00', '30.00', '45.00', '100.00', '100.01'])('%s se cobra exactamente igual, sin recargo', (price) => {
    expect(customerCounterPrice(price)).toBe(price);
  });

  it('normaliza pesos enteros y rechaza lo que no es dinero', () => {
    expect(customerCounterPrice('20')).toBe('20.00');
    expect(customerCounterPrice('20.505')).toBeNull();
  });
});
