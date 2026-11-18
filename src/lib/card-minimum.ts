// Mínimo por cobro con tarjeta en cafeterías (CAF-F04, back #265).
//
// `GET /estado-operativo` publica `tarjeta_minimo` como texto decimal ("30.00") o null (el
// negocio no tiene mínimo: todo lo que no es cafetería). La tarjeta solo aplica si el importe
// de ESE cobro es estrictamente mayor: $30.00 no pasa, $30.01 sí. Se compara en centavos, no
// como número flotante. Cada tramo de un cobro dividido se mide solo, no el total del pedido.
// El servidor sigue siendo la autoridad: si la UI se equivoca, responde 422 CARD_MIN_AMOUNT.
import { formatMoney, moneyToCents } from './money';

/** true = la tarjeta se puede ofrecer para este cobro. Un mínimo desconocido no bloquea. */
export function cardAllowedForCharge(amount: string, minimum: string | null | undefined): boolean {
  if (minimum === null || minimum === undefined || minimum.trim() === '') return true;
  const minimumCents = moneyToCents(minimum);
  const amountCents = moneyToCents(amount);
  if (minimumCents === null || amountCents === null) return true;
  return amountCents > minimumCents;
}

/** Aviso bajo la opción de tarjeta; null si el negocio no tiene mínimo. */
export function cardMinimumNotice(minimum: string | null | undefined, cashAvailable = true): string | null {
  if (minimum === null || minimum === undefined || moneyToCents(minimum) === null) return null;
  const base = `Para pagar con tarjeta, el cobro debe ser mayor a ${formatMoney(minimum.trim())}.`;
  return cashAvailable ? `${base} Puedes elegir efectivo en caja.` : base;
}

export interface CardMinimumDetails {
  minimo: string;
  efectivo_disponible: boolean;
}

/**
 * Lo que la UI usa del 422 CARD_MIN_AMOUNT: `details.minimo` y si hay efectivo en caja. El back
 * manda `details` como arreglo con un objeto; se acepta también el objeto suelto.
 */
export function cardMinimumDetails(details: unknown): CardMinimumDetails | null {
  const raw: unknown = Array.isArray(details) ? details[0] : details;
  if (!raw || typeof raw !== 'object') return null;
  const { minimo, efectivo_disponible: cash } = raw as { minimo?: unknown; efectivo_disponible?: unknown };
  if (typeof minimo !== 'string' || moneyToCents(minimo) === null) return null;
  return { minimo: minimo.trim(), efectivo_disponible: cash !== false };
}

/** Texto del 422 CARD_MIN_AMOUNT; null si los detalles no traen el mínimo. */
export function cardMinimumErrorText(details: unknown): string | null {
  const parsed = cardMinimumDetails(details);
  if (!parsed) return null;
  const base = `El cobro con tarjeta debe ser mayor a ${formatMoney(parsed.minimo)}.`;
  return parsed.efectivo_disponible
    ? `${base} Elige efectivo en caja o agrega productos.`
    : `${base} Agrega productos para continuar.`;
}
