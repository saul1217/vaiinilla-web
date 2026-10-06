import { useEffect, useState } from 'react';

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

export function useAdminTheme(): [AdminTheme, (next: AdminTheme) => void] {
  const [mode, setMode] = useState<AdminTheme>(readAdminTheme);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = mode;
  }, [mode]);

  const change = (next: AdminTheme) => {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Sin almacenamiento (modo privado): la elección dura lo que dure la pestaña.
    }
  };

  return [mode, change];
}
