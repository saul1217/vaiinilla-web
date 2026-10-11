const RELOAD_FLAG = 'vaiinilla:preload-reload';

/**
 * Tras un despliegue los nombres de los chunks cambian; si una pestaña vieja
 * falla al cargarlos, recarga la página una sola vez para obtener los nuevos.
 */
export function installPreloadErrorReload(
  target: Window = window,
  storage: Storage = sessionStorage,
): void {
  target.addEventListener('vite:preloadError', (event) => {
    if (storage.getItem(RELOAD_FLAG)) return;
    storage.setItem(RELOAD_FLAG, '1');
    event.preventDefault();
    target.location.reload();
  });
}
