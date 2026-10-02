import { describe, expect, it } from 'vitest';
import { claimAliases, partAmountCents } from './account-split';

describe('partes iguales', () => {
  it('redondea hacia abajo y la última parte paga el centavo que sobra', () => {
    expect(partAmountCents(10000n, 3)).toBe(3333n);
    expect(partAmountCents(6667n, 2)).toBe(3333n);
    expect(partAmountCents(3334n, 1)).toBe(3334n);
  });
});

describe('quién dijo que paga', () => {
  it('alias sin repetir y sin vacíos', () => {
    expect(claimAliases([{ pagara: 'Ana' }, { pagara: null }, { pagara: 'Luis' }, { pagara: 'Ana' }, {}])).toEqual(['Ana', 'Luis']);
  });
});
