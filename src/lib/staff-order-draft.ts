// Borrador del pedido de personal guardado en el navegador, por negocio, usuario y entorno.
// Guarda también la llave del intento en curso: si la página se recarga a media petición, al
// volver a mandar el mismo pedido sale con la misma Idempotency-Key y el servidor no lo duplica.
// No guarda tokens ni datos de la sesión.
import { draftStorageKey, type DurableStore, type OfflineStaffScope } from './offline-staff-orders';
import type { LlaveDeEnvio, StaffOrderDraft } from './staff-order';

export interface SavedStaffOrderDraft {
  draft: StaffOrderDraft;
  llave: LlaveDeEnvio | null;
  pagoAlFinalTocado: boolean;
}

function isSaved(value: unknown): value is SavedStaffOrderDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedStaffOrderDraft>;
  const draft = candidate.draft as Partial<StaffOrderDraft> | undefined;
  return Boolean(draft) && Array.isArray(draft?.lineas) && typeof draft?.destino === 'string';
}

/** Lee el borrador. Uno ilegible se ignora (no trae nada que proteger todavía). Si el almacenamiento falla, lanza. */
export function loadStaffOrderDraft(store: DurableStore, scope: OfflineStaffScope): SavedStaffOrderDraft | null {
  const raw = store.read(draftStorageKey(scope));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSaved(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStaffOrderDraft(store: DurableStore, scope: OfflineStaffScope, saved: SavedStaffOrderDraft): void {
  store.write(draftStorageKey(scope), JSON.stringify(saved));
}

export function clearStaffOrderDraft(store: DurableStore, scope: OfflineStaffScope): void {
  store.remove(draftStorageKey(scope));
}
