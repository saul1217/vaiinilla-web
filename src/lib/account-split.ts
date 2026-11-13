/**
 * Dividir la cuenta en partes iguales: cada parte es lo que falta entre las personas
 * que faltan, redondeado hacia abajo; con una parte se paga todo lo que queda, así
 * que el último centavo lo paga quien cierra. Igual que el backend (abonos-cuenta).
 */
export function partAmountCents(restanteCents: bigint, parts: number): bigint {
  if (parts <= 1) return restanteCents;
  return restanteCents / BigInt(parts);
}

/** Identidades de "esto lo pago yo", deduplicadas por participante (o alias legacy). */
export function claimGroups(orders: { pagara?: { id: string; alias: string | null } | string | null }[]) {
  const groups = new Map<string, { key: string; alias: string; id?: string }>();
  for (const { pagara } of orders) {
    if (typeof pagara === 'string' && pagara) {
      groups.set(`legacy:${pagara}`, { key: `legacy:${pagara}`, alias: pagara });
    } else if (pagara && typeof pagara === 'object' && pagara.alias) {
      const key = `participant:${pagara.id}`;
      groups.set(key, { key, id: pagara.id, alias: pagara.alias });
    }
  }
  return [...groups.values()];
}
