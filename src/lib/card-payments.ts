import type { TenantCardPayments } from '../types/api';

/** Lo que el dueño puede hacer según cómo está su cuenta de Stripe. */
export function cardPaymentsStep(config: TenantCardPayments | null | undefined): 'connect' | 'finish' | 'ready' {
  if (!config) return 'connect';
  return config.charges_enabled && config.payouts_enabled ? 'ready' : 'finish';
}

/**
 * Una cafetería con la tarjeta aprobada por la plataforma ya tiene la comisión en el precio del menú,
 * así que no puede pasarla además al cliente (el backend responde 422 si se intenta prender).
 */
export function commissionPassThroughLocked(
  config: TenantCardPayments | null | undefined,
  businessType: string | null | undefined,
): boolean {
  return businessType === 'cafeteria' && config?.aprobacion_plataforma?.vigente === true;
}
