import { Sparkles, Undo2 } from 'lucide-react';
import type { StaffUi } from '../lib/staff-ui';

/** Cambia entre la presentación nueva del personal y la anterior. */
export function StaffUiSwitch({ mode, onChange }: { mode: StaffUi; onChange: (next: StaffUi) => void }) {
  const toOld = mode === 'nueva';
  return (
    <button
      type="button"
      className="staff-ui-switch"
      onClick={() => onChange(toOld ? 'anterior' : 'nueva')}
      aria-label={toOld ? 'Volver a la UI anterior' : 'Usar la UI nueva'}
    >
      {toOld ? <Undo2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      <span>{toOld ? 'UI anterior' : 'UI nueva'}</span>
    </button>
  );
}
