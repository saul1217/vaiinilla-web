import { useEffect } from 'react';

/** Conservado para las ramas de presentación antiguas pendientes de limpieza. */
export type StaffUi = 'nueva' | 'anterior';

const KEY = 'vaiinilla.panel.staff-ui';

/** Retira la preferencia obsoleta; ninguna elección guardada activa la UI anterior. */
export function readStaffUi(): 'nueva' {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: la presentación actual sigue siendo obligatoria.
  }
  return 'nueva';
}

/** Aplica la presentación actual mientras está montada una vista del personal. */
export function useStaffUi(enabled: boolean): 'nueva' {
  useEffect(() => {
    readStaffUi();
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.staffUi = 'nueva';
    return () => {
      delete root.dataset.staffUi;
    };
  }, [enabled]);

  return 'nueva';
}

/** "Mesa 12" → { number: "12", kind: "Mesa" }; un nombre sin número queda completo. */
export function splitSpaceName(name: string): { number: string | null; kind: string } {
  const match = /^(.*?)\s*(\d+)$/.exec(name.trim());
  if (!match || !match[1]) return { number: match ? match[2] ?? null : null, kind: match ? '' : name };
  return { number: match[2] ?? null, kind: match[1] };
}
