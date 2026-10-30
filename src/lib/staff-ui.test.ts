import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStaffUi, splitSpaceName, useStaffUi } from './staff-ui';

describe('presentación del personal', () => {
  afterEach(() => window.localStorage.clear());

  it.each(['anterior', 'nueva', 'desconocida'])('ignora y borra la preferencia %s', (saved) => {
    window.localStorage.setItem('vaiinilla.panel.staff-ui', saved);
    expect(readStaffUi()).toBe('nueva');
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
  });

  it('usa la nueva aunque el almacenamiento esté bloqueado', () => {
    const remove = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    try {
      expect(readStaffUi()).toBe('nueva');
    } finally {
      remove.mockRestore();
    }
  });

  it('aplica la UI nueva y retira el tema al salir de la vista', () => {
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    const { result, rerender, unmount } = renderHook(({ enabled }) => useStaffUi(enabled), {
      initialProps: { enabled: true },
    });
    expect(result.current).toBe('nueva');
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
    expect(document.documentElement.dataset.staffUi).toBe('nueva');
    rerender({ enabled: false });
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
    rerender({ enabled: true });
    unmount();
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
  });

  it('limpia la preferencia sin aplicar el tema fuera del personal, incluido admin', () => {
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    const { unmount } = renderHook(() => useStaffUi(false));
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBeNull();
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
    unmount();
  });

  it('separa el número del tipo de espacio, como los mosaicos de la app', () => {
    expect(splitSpaceName('Mesa 2')).toEqual({ number: '2', kind: 'Mesa' });
    expect(splitSpaceName('VIP vaini 12')).toEqual({ number: '12', kind: 'VIP vaini' });
    expect(splitSpaceName('Barra')).toEqual({ number: null, kind: 'Barra' });
    expect(splitSpaceName('7')).toEqual({ number: '7', kind: '' });
  });
});
