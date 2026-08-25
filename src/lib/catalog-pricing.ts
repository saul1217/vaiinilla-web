import { centsToMoney, moneyToCents } from './money';

// Vista previa de la política de precio único del cliente. El backend repite
// el cálculo y es siempre la autoridad final del precio guardado.
export function calculateDigitalPrice(counterPrice: string): string | null {
  const cents = moneyToCents(counterPrice);
  if (cents === null) return null;

  // unified_customer_price_v4:
  // ceil(precio_mostrador_cents × 110 / 100)
  const customerPriceCents = (cents * 110n + 100n - 1n) / 100n;
  return centsToMoney(customerPriceCents);
}
