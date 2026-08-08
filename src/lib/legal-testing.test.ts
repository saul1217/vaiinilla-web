import { describe, expect, it } from 'vitest';
import { isUnpublishedLegalTestingEnabled } from './legal-testing';

describe('modo legal de prueba', () => {
  it('solo se habilita con el valor explícito true', () => {
    expect(isUnpublishedLegalTestingEnabled('true')).toBe(true);
    expect(isUnpublishedLegalTestingEnabled('false')).toBe(false);
    expect(isUnpublishedLegalTestingEnabled(undefined)).toBe(false);
    expect(isUnpublishedLegalTestingEnabled('TRUE')).toBe(false);
  });
});
