// Tipo y modos del negocio: el backend ya no los cambia con el PATCH de configuración sino con
// preflight (revisión de solo lectura) y una transición versionada con Idempotency-Key.
// Ver vaiinilla_back/src/services/configuracion-transiciones.service.js (CAMPOS_TRANSICION).
import { VaiinillaApiError } from './api-error';
import type {
  BusinessSettings,
  BusinessSettingsInput,
  ConfigurationTransitionChanges,
  ConfigurationTransitionOperation,
  ConfigurationTransitionPreflight,
} from '../types/api';

/** Mismo listado y orden que CAMPOS_TRANSICION del backend. */
export const TRANSITION_FIELDS = [
  'tipo',
  'entrega_en_espacio',
  'entrega_requiere_qr',
  'permite_pago_al_final',
  'barra_prepara',
  'permite_pago_en_caja',
  'cocina_prepara_sin_cobrar',
] as const satisfies readonly (keyof ConfigurationTransitionChanges)[];

export type TransitionField = (typeof TRANSITION_FIELDS)[number];

const TRANSITION_SET = new Set<string>(TRANSITION_FIELDS);

export function isTransitionField(field: string): field is TransitionField {
  return TRANSITION_SET.has(field);
}

/**
 * Separa un cambio de configuración en los campos de transición y los ajustes ordinarios (PATCH).
 * Con `current`, solo quedan como transición los campos que de verdad cambian: un valor igual al
 * guardado no abre una transición ni viaja en el PATCH.
 */
export function splitTransition(
  cambios: BusinessSettingsInput,
  current?: Partial<BusinessSettings> | null,
): { transition: ConfigurationTransitionChanges | null; ordinary: BusinessSettingsInput } {
  const transition: Record<string, unknown> = {};
  const ordinary: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(cambios)) {
    if (value === undefined) continue;
    if (isTransitionField(field)) {
      if (current && (current as Record<string, unknown>)[field] === value) continue;
      transition[field] = value;
    } else {
      ordinary[field] = value;
    }
  }
  return {
    transition: Object.keys(transition).length ? transition : null,
    ordinary,
  };
}

/** Detalle del 409 CONFIG_TRANSITION_BLOCKED (details[0] del backend). */
export interface TransitionBlockDetails {
  reason_codes: string[];
  bloqueos: ConfigurationTransitionPreflight['bloqueos'];
  operaciones: ConfigurationTransitionOperation[];
  total: number;
  version_actual: number | null;
}

export function transitionBlockDetails(error: unknown): TransitionBlockDetails | null {
  if (!(error instanceof VaiinillaApiError) || error.status !== 409 || error.code !== 'CONFIG_TRANSITION_BLOCKED') return null;
  const raw: unknown = Array.isArray(error.details) ? (error.details as unknown[])[0] : error.details;
  const detail = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ops = detail.operaciones && typeof detail.operaciones === 'object' ? (detail.operaciones as Record<string, unknown>) : {};
  const items = Array.isArray(ops.items) ? (ops.items as ConfigurationTransitionOperation[]) : [];
  return {
    reason_codes: Array.isArray(detail.reason_codes) ? (detail.reason_codes as string[]) : [],
    bloqueos: Array.isArray(detail.bloqueos) ? (detail.bloqueos as ConfigurationTransitionPreflight['bloqueos']) : [],
    operaciones: items,
    total: typeof ops.total === 'number' ? ops.total : items.length,
    version_actual: typeof detail.version_actual === 'number' ? detail.version_actual : null,
  };
}

export function isVersionConflict(error: unknown): boolean {
  return error instanceof VaiinillaApiError && error.status === 409 && error.code === 'CONFIG_VERSION_CONFLICT';
}

export function isNotFound(error: unknown): boolean {
  return error instanceof VaiinillaApiError && error.status === 404;
}

/** Motivos del backend en palabras del negocio; un código desconocido se muestra tal cual. */
const REASON_LABELS: Record<string, string> = {
  OPERATIONS_IN_FLIGHT: 'Hay operaciones en curso en el negocio.',
  HOTEL_TYPE_LOCKED: 'Un hotel no cambia de tipo desde aquí; pídelo a Vaiinilla.',
  FORBIDDEN_ROLE: 'Tu rol no puede hacer este cambio.',
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

/** Qué es cada operación que bloquea, para saber qué cerrar. */
const OPERATION_LABELS: Record<string, string> = {
  OPEN_ORDERS: 'Pedido abierto',
  OPEN_TABLES: 'Mesa o espacio abierto',
  OPEN_CASH_SESSION: 'Caja abierta',
  ACTIVE_RESERVATIONS: 'Reserva activa',
  ACTIVE_STAYS: 'Estancia de hotel',
  PAYMENTS_IN_FLIGHT: 'Pago en curso',
  STRIPE_CALLBACKS_IN_FLIGHT: 'Confirmación de Stripe en curso',
};

export function operationLabel(code: string): string {
  return OPERATION_LABELS[code] ?? code;
}
