export type OperationalRole = 'cliente' | 'cajero' | 'cocina' | 'admin' | 'mesero';
export type InvitationRole = Exclude<OperationalRole, 'cliente'>;
export type InvitationStatus =
  | 'pendiente'
  | 'aceptada'
  | 'revocada'
  | 'reemplazada'
  | 'expirada';

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    cursor?: string | null;
    [key: string]: unknown;
  };
  error: null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorEnvelope {
  data: null;
  meta?: Record<string, unknown>;
  error: ApiErrorBody;
}

export interface SessionAccess {
  membresia_id: string;
  establecimiento: {
    id: string;
    nombre: string;
    slug: string;
  };
  rol: OperationalRole;
  identificador_cliente: string | null;
  estado_establecimiento: 'activo' | 'suspendido';
  cierre_operativo_disponible: boolean;
}

export interface TenantContextResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  contexto: {
    usuario_id: string;
    membresia_id: string;
    establecimiento_id: string;
    rol: OperationalRole;
    modo_restringido: null | 'solo_lectura' | 'cierre_operativo';
  };
}

export interface StaffInvitation {
  id: string;
  email: string;
  rol: InvitationRole;
  estado: InvitationStatus;
  expira_en: string;
  creado_en: string;
  reemplaza_invitacion_id: string | null;
}

export interface CashSession {
  id: string;
  fecha_operativa: string;
  monto_inicial: string;
  monto_final: string | null;
  abierta_en: string;
  cerrada_en: string | null;
  cierre_automatico: boolean;
}

export interface PlatformContextResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  autoridad: {
    id: string;
    rol: 'superadmin';
  };
}

export interface PlatformSummary {
  establecimientos_activos: number;
  establecimientos_suspendidos: number;
  invitaciones_pendientes: number;
  calculado_en: string;
}

export interface PlatformEstablishment {
  id: string;
  nombre: string;
  slug: string;
  zona_horaria: string;
  hora_cierre_forzado: string;
  identificador_cliente_etiqueta: string;
  identificador_cliente_obligatorio: boolean;
  estado: 'activo' | 'suspendido';
  suspendido_en: string | null;
  motivo_suspension: string | null;
  creado_en: string;
}

export interface EstablishmentInput {
  nombre: string;
  slug: string;
  zona_horaria: string;
  hora_cierre_forzado: string;
  identificador_cliente_etiqueta: string;
  identificador_cliente_obligatorio: boolean;
}
