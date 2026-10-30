import { useEffect, useSyncExternalStore } from 'react';

/**
 * Todo el panel (Administración y acceso) arranca en modo oscuro; cada
 * dispositivo puede pasarlo a claro y se recuerda. Solo cambia la
 * presentación: marca el documento (`data-admin-theme`).
 */
export type AdminTheme = 'oscuro' | 'claro';

const KEY = 'vaiinilla.panel.admin-theme';

export function readAdminTheme(): AdminTheme {
  try {
    return window.localStorage.getItem(KEY) === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

const listeners = new Set<() => void>();
let transientTheme: AdminTheme | undefined;

function snapshot(): AdminTheme {
  return transientTheme ?? readAdminTheme();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    transientTheme = undefined;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function changeTheme(next: AdminTheme) {
  transientTheme = undefined;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    transientTheme = next;
  }
  document.documentElement.dataset.adminTheme = next;
  listeners.forEach((listener) => listener());
}

export function useAdminTheme(): [AdminTheme, (next: AdminTheme) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, () => 'oscuro' as const);
  useEffect(() => {
    document.documentElement.dataset.adminTheme = mode;
  }, [mode]);
  return [mode, changeTheme];
}
