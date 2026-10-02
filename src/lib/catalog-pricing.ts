import { centsToMoney, moneyToCents } from './money';

/**
 * Lo que paga el cliente con efectivo, saldo o terminal: el precio de mostrador, sin recargo.
 * Con tarjeta es el mismo salvo que el negocio pase la comisión al cliente; entonces el backend
 * suma el cargo y es siempre la autoridad final del precio.
 */
export function customerCounterPrice(counterPrice: string): string | null {
  const cents = moneyToCents(counterPrice);
  return cents === null ? null : centsToMoney(cents);
}
