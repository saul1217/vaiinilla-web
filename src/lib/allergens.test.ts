import { describe, expect, it } from 'vitest';
import { addAllergens, allergenList, pendingAllergens } from './allergens';

describe('alérgenos del producto', () => {
  it('lista sin vacíos ni repetidos', () => {
    expect(allergenList(' Gluten, , gluten,Lácteos ')).toEqual(['Gluten', 'Lácteos']);
  });
  it('agrega sin repetir y deja fuera lo ya escrito', () => {
    expect(addAllergens('Leche', ['Gluten', 'leche'])).toBe('Leche, Gluten');
    expect(addAllergens('', ['Soya'])).toBe('Soya');
    expect(pendingAllergens('Gluten', ['gluten', 'lacteos', 'mostaza'])).toEqual(['Lácteos', 'Mostaza']);
  });
});
