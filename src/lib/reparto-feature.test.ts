import { describe, expect, it } from 'vitest';
import { REPARTO_ENABLED } from './reparto-feature';

describe('bandera de reparto', () => {
  it('está prendida en develop', () => {
    expect(REPARTO_ENABLED).toBe(true);
  });
});
