// Alérgenos de un producto como texto libre («Gluten, Lácteos»), como los guarda el menú
// (espejo de `domain/allergens.ts` de Expo).
import { allergenLabel } from './student-counter';

export { allergenLabel };

/** Las etiquetas escritas, sin vacíos ni repetidas (sin importar mayúsculas). */
export function allergenList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of text.split(',').map((item) => item.trim()).filter(Boolean)) {
    const key = label.toLocaleLowerCase('es-MX');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Suma etiquetas al texto sin repetir las que ya estaban. */
export function addAllergens(text: string, labels: readonly string[]): string {
  return allergenList([text, ...labels].join(',')).join(', ');
}

/** Lo sugerido que todavía no está escrito. */
export function pendingAllergens(text: string, codes: readonly string[]): string[] {
  const chosen = new Set(allergenList(text).map((label) => label.toLocaleLowerCase('es-MX')));
  return [...new Set(codes.map(allergenLabel))].filter((label) => !chosen.has(label.toLocaleLowerCase('es-MX')));
}
