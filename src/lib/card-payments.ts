import type { CardPlatformApproval, TenantCardPayments } from '../types/api';

/** Lo que el dueño puede hacer según cómo está su cuenta de Stripe. */
export function cardPaymentsStep(config: TenantCardPayments | null | undefined): 'connect' | 'finish' | 'ready' {
  if (!config) return 'connect';
  return config.charges_enabled && config.payouts_enabled ? 'ready' : 'finish';
}

/** Estado de la aprobación de la plataforma para cobrar con tarjeta (back #266). */
export function cardApprovalLabel(approval: CardPlatformApproval | null | undefined): string {
  if (approval?.vigente) return approval.origen === 'backfill' ? 'Aprobada (heredada de la migración)' : 'Aprobada';
  if (approval?.estado === 'revocada') return 'Revocada';
  return 'Pendiente de aprobación';
}
