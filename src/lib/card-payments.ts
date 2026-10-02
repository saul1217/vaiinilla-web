import type { TenantCardPayments } from '../types/api';

/** Lo que el dueño puede hacer según cómo está su cuenta de Stripe. */
export function cardPaymentsStep(config: TenantCardPayments | null | undefined): 'connect' | 'finish' | 'ready' {
  if (!config) return 'connect';
  return config.charges_enabled && config.payouts_enabled ? 'ready' : 'finish';
}
