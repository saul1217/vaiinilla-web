import type { ConfigTransitionPreflight } from '../types/api';

// Motivos del contrato que no son una operación en curso (los bloqueos traen su propio mensaje).
const REASONS: Record<string, string> = {
  HOTEL_TYPE_LOCKED: 'Un hotel no se cambia de tipo desde aquí.',
  FORBIDDEN_ROLE: 'Solo Super Admin puede hacer este cambio.',
};

/**
 * Por qué la revisión previa no deja aplicar el cambio, en palabras de la tienda: cada bloqueo con
 * su cantidad («Hay una sesión de caja abierta (1)») y los motivos del contrato. Null si se puede.
 */
export function transitionBlockedMessage(check: ConfigTransitionPreflight): string | null {
  if (check.permitido) return null;
  const parts = [
    ...(check.bloqueos ?? []).map((b) => (b.count > 1 ? `${b.message} (${b.count})` : b.message)),
    ...(check.reason_codes ?? [])
      .filter((code) => code !== 'OPERATIONS_IN_FLIGHT')
      .map((code) => REASONS[code] ?? `No se puede por ahora (${code}).`),
  ];
  const detail = parts.length ? parts.join(' · ') : 'Hay operaciones activas.';
  return `No se puede cambiar ahora. ${detail} Ciérralas y vuelve a intentarlo.`;
}
