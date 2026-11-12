import { describe, expect, it } from 'vitest';
import { REPARTO_ENABLED } from './reparto-feature';

describe('bandera de reparto', () => {
  it('sale apagada hasta que COORDINADOR_QA la libere', () => {
    expect(REPARTO_ENABLED).toBe(false);
  });
});
