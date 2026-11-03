import { describe, expect, it } from 'vitest';
import { claimGroups, partAmountCents } from './account-split';

describe('partes iguales', () => {
  it('redondea hacia abajo y la última parte paga el centavo que sobra', () => {
    expect(partAmountCents(10000n, 3)).toBe(3333n);
    expect(partAmountCents(6667n, 2)).toBe(3333n);
    expect(partAmountCents(3334n, 1)).toBe(3334n);
  });
});

describe('quién dijo que paga', () => {
  it('alias sin repetir y sin vacíos', () => {
    expect(claimGroups([{ pagara: 'Ana' }, { pagara: null }, { pagara: 'Luis' }, { pagara: 'Ana' }, {}])).toEqual([
      { key: 'legacy:Ana', alias: 'Ana' }, { key: 'legacy:Luis', alias: 'Luis' },
    ]);
  });

  it('mantiene separados participantes con el mismo alias', () => {
    expect(claimGroups([
      { pagara: { id: 'p1', alias: 'Alex' } },
      { pagara: { id: 'p2', alias: 'Alex' } },
      { pagara: { id: 'p1', alias: 'Alex' } },
    ])).toEqual([
      { key: 'participant:p1', id: 'p1', alias: 'Alex' },
      { key: 'participant:p2', id: 'p2', alias: 'Alex' },
    ]);
  });
});
