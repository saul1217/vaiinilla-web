import type { RefundMethod } from '../types/api';

/** Se devuelve por donde entró: lo de tarjeta en la terminal; efectivo, saldo o su mezcla, en efectivo. */
export function suggestedRefundMethod(original: string): RefundMethod {
  return original.split('+').some((method) => method === 'terminal' || method === 'stripe') ? 'terminal' : 'efectivo';
}

/** El servidor no deja devolver efectivo con la caja cerrada, salvo lo cobrado en la puerta (no entró al cajón). */
export function refundCashBlocked(cashOpen: boolean | undefined, original: string): boolean {
  return cashOpen === false && !original.startsWith('entrega_');
}
