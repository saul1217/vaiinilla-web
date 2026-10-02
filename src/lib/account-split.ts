/**
 * Dividir la cuenta en partes iguales: cada parte es lo que falta entre las personas
 * que faltan, redondeado hacia abajo; con una parte se paga todo lo que queda, así
 * que el último centavo lo paga quien cierra. Igual que el backend (abonos-cuenta).
 */
export function partAmountCents(restanteCents: bigint, parts: number): bigint {
  if (parts <= 1) return restanteCents;
  return restanteCents / BigInt(parts);
}

/** Los alias de "esto lo pago yo" en los pedidos por cobrar, sin repetir, en orden. */
export function claimAliases(orders: { pagara?: string | null }[]): string[] {
  return [...new Set(orders.map((order) => order.pagara).filter((alias): alias is string => Boolean(alias)))];
}
