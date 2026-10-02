import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStaffUi } from '../lib/staff-ui';
import { StaffUiSwitch } from './staff-ui-switch';

function Harness() {
  const [mode, setMode] = useStaffUi(true);
  return <StaffUiSwitch mode={mode} onChange={setMode} />;
}

describe('botón de UI anterior', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-staff-ui');
  });

  it('cambia a la UI anterior, lo recuerda y deja el tema claro (el oscuro solo aplica con la nueva)', () => {
    render(<Harness />);
    expect(document.documentElement.dataset.staffUi).toBe('nueva');

    fireEvent.click(screen.getByRole('button', { name: 'Volver a la UI anterior' }));

    expect(screen.getByRole('button', { name: 'Usar la UI nueva' })).toBeInTheDocument();
    expect(window.localStorage.getItem('vaiinilla.panel.staff-ui')).toBe('anterior');
    expect(document.documentElement.dataset.staffUi).toBe('anterior');
  });

  it('fuera de las vistas del personal no oscurece el panel', () => {
    const { unmount } = renderHook(() => useStaffUi(false));
    expect(document.documentElement.dataset.staffUi).toBeUndefined();
    act(() => unmount());
  });
});
