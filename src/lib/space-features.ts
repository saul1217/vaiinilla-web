// Mismas reglas que el backend (src/services/espacios-ficha.js).
export const MAX_FEATURES = 8;
export const MAX_FEATURE_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 500;

/** Sugerencias para una cancha; el dueño puede escribir las suyas. */
export const COURT_FEATURE_SUGGESTIONS = ['Techada', 'Con luz', 'Vidrio panorámico', 'Pasto sintético', 'Aire libre'];

function key(feature: string) {
  return feature.toLocaleLowerCase('es');
}

export function normalizeFeature(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Agrega una etiqueta si cabe y no está repetida (sin importar mayúsculas). */
export function addFeature(features: string[], raw: string): string[] {
  const feature = normalizeFeature(raw);
  if (!feature || feature.length > MAX_FEATURE_LENGTH || features.length >= MAX_FEATURES) return features;
  if (features.some((existing) => key(existing) === key(feature))) return features;
  return [...features, feature];
}

export function removeFeature(features: string[], feature: string): string[] {
  return features.filter((existing) => existing !== feature);
}

export function sameFeatures(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((feature, index) => feature === b[index]);
}
