import { describe, expect, it } from 'vitest';
import { manualGuides, manualMatches, manualRoleFor, manualSections } from './staff-manual';

describe('manual «Paso a paso»', () => {
  it('cada rol tiene su manual con secciones y pasos', () => {
    for (const role of ['Caja', 'Cocina', 'Mesero'] as const) {
      const guides = manualGuides(role);
      expect(guides.length).toBeGreaterThan(3);
      expect(new Set(guides.map((g) => g.id)).size).toBe(guides.length);
      expect(guides.every((g) => g.steps.length >= 2)).toBe(true);
      expect(manualSections(guides).length).toBeGreaterThan(1);
    }
  });

  it('busca sin acentos ni mayúsculas en título y pasos', () => {
    const caja = manualGuides('Caja');
    expect(caja.filter((g) => manualMatches(g, 'CERRAR caja')).map((g) => g.id)).toContain('cerrar-caja');
    expect(caja.filter((g) => manualMatches(g, 'credencial')).map((g) => g.id)).toEqual(['alumno-sin-telefono']);
    expect(manualGuides('Cocina').some((g) => manualMatches(g, 'deshacer'))).toBe(true);
    expect(caja.every((g) => manualMatches(g, '  '))).toBe(true);
  });

  it('elige el manual según el rol de la sesión', () => {
    expect(manualRoleFor('cocina')).toBe('Cocina');
    expect(manualRoleFor('mesero')).toBe('Mesero');
    expect(manualRoleFor('cajero')).toBe('Caja');
    expect(manualRoleFor(undefined)).toBe('Caja');
  });
});
