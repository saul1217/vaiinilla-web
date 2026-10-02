import { useEffect, useState } from 'react';

/**
 * Las vistas del personal (Mesero, Caja y Cocina) tienen dos presentaciones: la nueva, oscura y
 * como las apps, y la anterior. Cada dispositivo recuerda la suya. Solo cambia la presentación.
 */
export type StaffUi = 'nueva' | 'anterior';

const KEY = 'vaiinilla.panel.staff-ui';

export function readStaffUi(): StaffUi {
  try {
    return window.localStorage.getItem(KEY) === 'anterior' ? 'anterior' : 'nueva';
  } catch {
    return 'nueva';
  }
}

/**
 * La presentación del personal. Mientras la vista está montada y `enabled`, marca el documento
 * (`data-staff-ui`) para que el marco completo del panel tome el tema de la vista.
 */
export function useStaffUi(enabled: boolean): [StaffUi, (next: StaffUi) => void] {
  const [mode, setMode] = useState<StaffUi>(readStaffUi);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.staffUi = mode;
    return () => {
      delete root.dataset.staffUi;
    };
  }, [enabled, mode]);

  const change = (next: StaffUi) => {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Sin almacenamiento (modo privado): la elección dura lo que dure la pestaña.
    }
  };

  return [mode, change];
}

/** "Mesa 12" → { number: "12", kind: "Mesa" }; un nombre sin número queda completo. */
export function splitSpaceName(name: string): { number: string | null; kind: string } {
  const match = /^(.*?)\s*(\d+)$/.exec(name.trim());
  if (!match || !match[1]) return { number: match ? match[2] ?? null : null, kind: match ? '' : name };
  return { number: match[2] ?? null, kind: match[1] };
}
