import type { ManagedSpace } from '../types/api';

/** El negocio renta espacios (canchas) con precio por hora desde "Espacios". */
export function rentsSpaces(spaces: ManagedSpace[] | undefined): boolean {
  return (spaces ?? []).some((space) => Number(space.precio_hora ?? 0) > 0);
}

const RENTAL_WORDS = /\b(renta|rentar|cancha|canchas|hora|horas|reserva|p[aá]del)\b/i;

/** El nombre parece una renta, p. ej. "Renta cancha 1 h" o "Pádel 1 hora". */
export function looksLikeRental(name: string): boolean {
  return RENTAL_WORDS.test(name);
}
