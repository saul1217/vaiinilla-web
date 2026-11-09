/** Panel admin: oculta cashback/wallet hasta reactivarlo. No afecta al backend ni a saldos. */
export const CASHBACK_ENABLED = false;
export const CORTES_REPORTE_ENABLED = false;
/** Asistente IA de configuración: apagado hasta pasar QA_SEGURIDAD y resolver backend #226 y #229. */
export const IA_CONFIG_ENABLED = false;

/** Piloto del endpoint vaiinilla_back#211. Debe habilitarse explícitamente por entorno. */
export function isPosMixedPaymentsEnabled(): boolean {
  return import.meta.env.VITE_POS_MIXED_PAYMENTS_ENABLED === 'true';
}
