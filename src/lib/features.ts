/** Panel admin: oculta cashback/wallet hasta reactivarlo. No afecta al backend ni a saldos. */
export const CASHBACK_ENABLED = false;

/** Piloto del endpoint vaiinilla_back#211. Debe habilitarse explícitamente por entorno. */
export function isPosMixedPaymentsEnabled(): boolean {
  return import.meta.env.VITE_POS_MIXED_PAYMENTS_ENABLED === 'true';
}
