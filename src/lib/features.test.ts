import { describe, expect, it } from 'vitest';
import { CASHBACK_ENABLED } from './features';
import { SIN_INTERNET_ENABLED } from './sin-internet-flag';

describe('feature flags del panel', () => {
  it('cashback desactivado en admin hasta reactivarlo', () => {
    expect(CASHBACK_ENABLED).toBe(false);
  });

  it('sin internet queda apagado hasta que QA lo libere', () => {
    expect(SIN_INTERNET_ENABLED).toBe(false);
  });
});
