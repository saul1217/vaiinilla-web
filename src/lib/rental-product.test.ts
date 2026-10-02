import { describe, expect, it } from 'vitest';
import { looksLikeRental, rentsSpaces } from './rental-product';

describe('renta como producto', () => {
  it('reconoce nombres de renta', () => {
    expect(looksLikeRental('Pádel 1 hora')).toBe(true);
    expect(looksLikeRental('Renta cancha 1 h')).toBe(true);
    expect(looksLikeRental('Hamburguesa')).toBe(false);
    expect(looksLikeRental('Horchata')).toBe(false);
  });

  it('un negocio renta si algún espacio tiene precio por hora', () => {
    expect(rentsSpaces([{ precio_hora: null }, { precio_hora: '250.00' }] as never)).toBe(true);
    expect(rentsSpaces([{ precio_hora: null }] as never)).toBe(false);
    expect(rentsSpaces(undefined)).toBe(false);
  });
});
