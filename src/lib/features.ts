/** Panel admin de cashback y wallet (Doop 55 y 56): prendido en develop el 16 nov. */
export const CASHBACK_ENABLED = true;
/** Cortes de caja (Caja y admin) y reporte contable con su CSV (solo admin). */
export const CORTES_REPORTE_ENABLED = true;
/**
 * Asistente IA de configuración: prendido en develop el 16 nov. Back #226 y #229 ya están en develop,
 * igual que el tope al xlsx descomprimido y el Excel como datos con rol `user`
 * (docs/asistente-ia-backend-pendiente.md). Antes de producción, que lo revise QA_SEGURIDAD.
 */
export const IA_CONFIG_ENABLED = true;

/** Piloto del endpoint vaiinilla_back#211. Debe habilitarse explícitamente por entorno. */
export function isPosMixedPaymentsEnabled(): boolean {
  return import.meta.env.VITE_POS_MIXED_PAYMENTS_ENABLED === 'true';
}
