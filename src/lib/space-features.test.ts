import { describe, expect, it } from 'vitest';
import { addFeature, MAX_FEATURES, removeFeature, sameFeatures } from './space-features';

describe('características del espacio', () => {
  it('agrega limpiando espacios y sin repetir', () => {
    let features = addFeature([], '  Con   luz ');
    features = addFeature(features, 'con luz');
    features = addFeature(features, 'Techada');
    expect(features).toEqual(['Con luz', 'Techada']);
  });

  it('ignora vacías, largas y las que no caben', () => {
    expect(addFeature([], '   ')).toEqual([]);
    expect(addFeature([], 'x'.repeat(31))).toEqual([]);
    const full = Array.from({ length: MAX_FEATURES }, (_, i) => `F${i}`);
    expect(addFeature(full, 'Otra')).toBe(full);
  });

  it('quita y compara', () => {
    expect(removeFeature(['A', 'B'], 'A')).toEqual(['B']);
    expect(sameFeatures(['A', 'B'], ['A', 'B'])).toBe(true);
    expect(sameFeatures(['A', 'B'], ['B', 'A'])).toBe(false);
  });
});
