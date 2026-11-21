import { describe, expect, it } from 'vitest';
import { CASHBACK_ENABLED } from './features';
import { SIN_INTERNET_ENABLED } from './sin-internet-flag';

describe('feature flags del panel', () => {
  it('cashback está prendido en develop', () => {
    expect(CASHBACK_ENABLED).toBe(true);
  });

  it('sin internet está prendido en develop', () => {
    expect(SIN_INTERNET_ENABLED).toBe(true);
  });
});
