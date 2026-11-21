import type { DeliveryValidation, OperationalStatus, OrderDetail } from '../types/api';

/**
 * Cobro con código (migración 225 del back): con la opción prendida, lo que el cliente pidió en la
 * app se cobra con su QR, su código o su credencial. Lo de mostrador, VILLO y la cuenta de mesa no.
 * Un back anterior no manda `origen`: no se pide nada y, si hiciera falta, el back lo dice.
 */
export function paymentNeedsProof(
  order: Pick<OrderDetail, 'origen' | 'pago_diferido'>,
  status: Pick<OperationalStatus, 'cobro_requiere_codigo'> | undefined,
): boolean {
  return status?.cobro_requiere_codigo === true && order.origen === 'app' && order.pago_diferido !== true;
}

/** Qué prueba pide el cobro: la de la entrega; con «sin validar», QR o código. */
export function paymentProofMode(mode: DeliveryValidation | undefined): DeliveryValidation {
  return mode === 'qr' || mode === 'codigo' ? mode : 'qr_o_codigo';
}
