import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// En este entorno jsdom deja window.localStorage roto; las pruebas usan un
// almacenamiento en memoria cuando el nativo no sirve (solo pruebas).
function ensureLocalStorage() {
  try {
    if (typeof window.localStorage?.getItem === 'function') {
      window.localStorage.clear();
      return;
    }
  } catch {
    // roto: se reemplaza abajo
  }
  const area = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return area.size;
    },
    clear: () => area.clear(),
    getItem: (key: string) => (area.has(key) ? area.get(key)! : null),
    key: (index: number) => [...area.keys()][index] ?? null,
    removeItem: (key: string) => {
      area.delete(key);
    },
    setItem: (key: string, value: string) => {
      area.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    configurable: true,
    value: shim,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    writable: true,
    configurable: true,
    value: shim,
  });
}

ensureLocalStorage();
