import { afterEach, describe, expect, it } from 'vitest';
import { applyAdminTheme, isDarkAdminTheme, readAdminTheme } from './admin-theme';

const KEY = 'vaiinilla.panel.admin-theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.adminTheme;
  delete document.documentElement.dataset.vaiTheme;
  document.head.innerHTML = '';
});

describe('tema del panel con los modos de Android', () => {
  it('usa AMOLED por omisión y respeta lo guardado', () => {
    expect(readAdminTheme()).toBe('amoled');
    localStorage.setItem(KEY, 'claro');
    expect(readAdminTheme()).toBe('claro');
    localStorage.setItem(KEY, 'oscuro');
    expect(readAdminTheme()).toBe('oscuro');
    localStorage.setItem(KEY, 'otro');
    expect(readAdminTheme()).toBe('amoled');
  });

  it('AMOLED conserva las reglas de modo oscuro y marca el modo exacto', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    applyAdminTheme('amoled');
    expect(document.documentElement.dataset.adminTheme).toBe('oscuro');
    expect(document.documentElement.dataset.vaiTheme).toBe('amoled');
    expect(meta.content).toBe('#000000');
    applyAdminTheme('claro');
    expect(document.documentElement.dataset.adminTheme).toBe('claro');
    expect(meta.content).toBe('#F4F1E7');
    expect(isDarkAdminTheme('oscuro')).toBe(true);
    expect(isDarkAdminTheme('claro')).toBe(false);
  });
});
