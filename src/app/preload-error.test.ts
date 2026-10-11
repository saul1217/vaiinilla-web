import { describe, expect, it, vi } from 'vitest';
import { installPreloadErrorReload } from './preload-error';

function setup(storageFactory?: () => Storage) {
  const listeners: Array<(e: Event) => void> = [];
  const reload = vi.fn();
  const target = {
    addEventListener: (_: string, cb: (e: Event) => void) => listeners.push(cb),
    location: { reload },
  } as unknown as Window;
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as unknown as Storage;
  let time = 1_000_000;
  installPreloadErrorReload(target, storageFactory ?? (() => storage), () => time);
  return {
    fire: () => listeners[0]?.(new Event('vite:preloadError', { cancelable: true })),
    reload,
    advance: (ms: number) => void (time += ms),
  };
}

describe('installPreloadErrorReload', () => {
  it('recarga una sola vez si dos eventos llegan dentro del plazo', () => {
    const { fire, reload, advance } = setup();
    fire();
    advance(2_000);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('vuelve a recargar cuando ya pasó el plazo (segundo despliegue)', () => {
    const { fire, reload, advance } = setup();
    fire();
    advance(11_000);
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('recarga aunque sessionStorage lance error', () => {
    const { fire, reload } = setup(() => {
      throw new Error('denegado');
    });
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
