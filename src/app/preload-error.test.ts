import { describe, expect, it, vi } from 'vitest';
import { installPreloadErrorReload } from './preload-error';

function setup() {
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
  installPreloadErrorReload(target, storage);
  return { fire: () => listeners[0]?.(new Event('vite:preloadError', { cancelable: true })), reload };
}

describe('installPreloadErrorReload', () => {
  it('recarga una sola vez ante vite:preloadError', () => {
    const { fire, reload } = setup();
    fire();
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
