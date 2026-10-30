import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLegacyStaffUi, splitSpaceName, useStaffTheme } from './staff-ui';

describe('presentación del personal', () => {
  afterEach(() => window.localStorage.clear());

  it.each(['anterior', 'nueva', 'desconocida'])('ignora y borra la preferencia %s', (saved) => {
    window.localStorage.setItem('vaiinilla.panel.staff-ui', saved);
    expect(clearLegacyStaffUi()).toBeUndefined();
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
  });

  it('usa la nueva aunque el almacenamiento esté bloqueado', () => {
    const remove = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    try {
      expect(clearLegacyStaffUi()).toBeUndefined();
    } finally {
      remove.mockRestore();
    }
  });

  it('limpia la preferencia obsoleta sin activar un tema del personal', () => {
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    const { unmount } = renderHook(() => useStaffTheme());
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
    unmount();
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
  });

  it('separa el número del tipo de espacio, como los mosaicos de la app', () => {
    expect(splitSpaceName('Mesa 2')).toEqual({ number: '2', kind: 'Mesa' });
    expect(splitSpaceName('VIP vaini 12')).toEqual({ number: '12', kind: 'VIP vaini' });
    expect(splitSpaceName('Barra')).toEqual({ number: null, kind: 'Barra' });
    expect(splitSpaceName('7')).toEqual({ number: '7', kind: '' });
  });
});
