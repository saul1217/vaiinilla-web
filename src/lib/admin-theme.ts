import { useEffect, useSyncExternalStore } from 'react';

/**
 * Los mismos modos que la app de Android (`VaiinillaThemeMode`): claro, oscuro
 * y AMOLED (negro real). Todo el panel (Administración y acceso) arranca en
 * AMOLED; cada dispositivo puede cambiarlo y se recuerda. Solo cambia la
 * presentación: marca el documento con `data-admin-theme` (claro u oscuro,
 * para las reglas que ya existen) y `data-vai-theme` (el modo exacto, para
 * los tokens de Android en `styles/android-tokens.css`).
 */
export type AdminTheme = 'claro' | 'oscuro' | 'amoled';

export const ADMIN_THEMES: readonly AdminTheme[] = ['claro', 'oscuro', 'amoled'];

const KEY = 'vaiinilla.panel.admin-theme';
const DEFAULT_THEME: AdminTheme = 'amoled';

function parseTheme(value: string | null): AdminTheme {
  return value === 'claro' || value === 'oscuro' || value === 'amoled' ? value : DEFAULT_THEME;
}

export function readAdminTheme(): AdminTheme {
  try {
    return parseTheme(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Oscuro y AMOLED comparten las reglas de modo oscuro; AMOLED solo cambia el papel a negro real. */
export function isDarkAdminTheme(theme: AdminTheme): boolean {
  return theme !== 'claro';
}

export function applyAdminTheme(theme: AdminTheme, root: HTMLElement = document.documentElement) {
  root.dataset.adminTheme = isDarkAdminTheme(theme) ? 'oscuro' : 'claro';
  root.dataset.vaiTheme = theme;
  // La barra del navegador en móvil toma el color del papel, como la barra de estado en Android.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

const THEME_COLOR: Record<AdminTheme, string> = { claro: '#F4F1E7', oscuro: '#1D1E1C', amoled: '#000000' };

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
  applyAdminTheme(next);
  listeners.forEach((listener) => listener());
}

export function useAdminTheme(): [AdminTheme, (next: AdminTheme) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_THEME);
  useEffect(() => {
    applyAdminTheme(mode);
  }, [mode]);
  return [mode, changeTheme];
}
