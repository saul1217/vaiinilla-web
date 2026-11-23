/**
 * Aviso de que cambiaron los espacios (crear, editar o borrar). El menú lo usa para volver a revisar
 * si hay canchas que rentar: crear la primera cancha muestra la agenda sin recargar la página.
 */
const listeners = new Set<() => void>();

export function onSpacesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySpacesChanged(): void {
  listeners.forEach((listener) => listener());
}
