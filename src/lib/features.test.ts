import { describe, expect, it } from 'vitest';
import { CASHBACK_ENABLED } from './features';

describe('feature flags del panel', () => {
  it('cashback desactivado en admin hasta reactivarlo', () => {
    expect(CASHBACK_ENABLED).toBe(false);
  });
});
