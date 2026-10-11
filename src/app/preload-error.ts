const RELOAD_KEY = 'vaiinilla:preload-reload';
const RELOAD_WINDOW_MS = 10_000;

/**
 * Tras un despliegue los nombres de los chunks cambian; si una pestaña vieja
 * falla al cargarlos, recarga la página para obtener los nuevos. Se guarda la
 * hora de la última recarga: dentro de la ventana no se repite (evita bucles),
 * pasada la ventana una pestaña que sigue abierta puede recuperarse otra vez.
 */
export function installPreloadErrorReload(
  target: Window = window,
  getStorage: () => Storage = () => sessionStorage,
  now: () => number = Date.now,
): void {
  target.addEventListener('vite:preloadError', (event) => {
    let storage: Storage | null = null;
    let last = 0;
    try {
      storage = getStorage();
      last = Number(storage.getItem(RELOAD_KEY)) || 0;
    } catch {
      // sessionStorage no disponible: se recarga sin marca.
    }
    const t = now();
    if (last && t - last < RELOAD_WINDOW_MS) return;
    try {
      storage?.setItem(RELOAD_KEY, String(t));
    } catch {
      // sin almacenamiento no se puede recordar la recarga.
    }
    event.preventDefault();
    target.location.reload();
  });
}
