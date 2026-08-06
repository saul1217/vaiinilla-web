import type { ApiErrorBody } from '../types/api';

const friendlyMessages: Record<string, string> = {
  UNAUTHENTICATED: 'Tu sesión terminó. Inicia sesión nuevamente.',
  EMAIL_NOT_VERIFIED: 'Verifica tu correo antes de continuar.',
  MFA_REQUIRED: 'Super Admin requiere un segundo factor TOTP reciente.',
  CONTEXT_NOT_ALLOWED: 'Esta cuenta no tiene permiso para entrar a esta sección.',
  PLATFORM_AUTHORITY_INACTIVE: 'La autoridad de plataforma está inactiva.',
  ESTABLISHMENT_SUSPENDED: 'El establecimiento está suspendido para operaciones nuevas.',
  INVITATION_PENDING_EXISTS: 'Ya existe una invitación pendiente para ese correo y rol.',
  INVITATION_STATE_CONFLICT: 'La invitación ya no se encuentra en un estado compatible.',
  INVITATION_EXPIRED: 'La invitación ya expiró.',
  INVITATION_REVOKED: 'La invitación fue revocada.',
  INVITATION_REPLACED: 'La invitación fue reemplazada por un reenvío.',
  INVITATION_ALREADY_USED: 'La invitación ya fue utilizada.',
  SESSION_INVALID_STATE: 'La sesión de Caja ya cambió de estado.',
  RATE_LIMITED: 'Se alcanzó el límite temporal. Espera antes de volver a intentar.',
  VALIDATION_ERROR: 'Revisa los datos capturados e inténtalo nuevamente.',
};

export class VaiinillaApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly retryAfter?: number;

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(friendlyMessages[body.code] ?? body.message ?? 'No fue posible completar la operación.');
    this.name = 'VaiinillaApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.retryAfter = retryAfter;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
