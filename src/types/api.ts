export type OperationalRole = 'cliente' | 'cajero' | 'cocina' | 'admin' | 'mesero';
export type InvitationRole = Exclude<OperationalRole, 'cliente'>;
export type OrderStatus =
  | 'por_cobrar'
  | 'cobrado'
  | 'preparando'
  | 'listo'
  | 'entregado'
  | 'cancelado'
  | 'no_recogido'
  | 'expirado';
export type PaymentMethod = 'stripe' | 'efectivo' | 'saldo';
export type OrderDestination = 'para_llevar' | 'en_espacio';
export type InvitationStatus = 'pendiente' | 'aceptada' | 'revocada' | 'reemplazada' | 'expirada';

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
  membresia_id: string | null;
}

export interface StaffMembership {
  id: string;
  usuario_id: string;
  nombre: string;
  email: string;
  rol: InvitationRole;
  activo: boolean;
  creado_en: string;
}

export interface InvitationAcceptance {
  invitacion_id: string;
  membresia: {
    id: string;
    establecimiento_id: string;
    rol: InvitationRole;
    activo: boolean;
  };
  aceptada_en: string;
}

export interface LegalVersions {
  terminos_version: string;
  terminos_url: string;
  privacidad_version: string;
  privacidad_url: string;
}

export interface IdentityRegistrationInput {
  nombre: string;
  terminos_version: string;
  privacidad_version: string;
}

export interface IdentityRegistration {
  usuario: {
    id: string;
    nombre: string;
    email: string;
    email_verificado_en: string | null;
  };
  consentimiento: {
    terminos_version: string;
    privacidad_version: string;
    aceptado_en: string;
  };
}

export interface AccountDeletion {
  solicitud_id: string;
  estado: 'eliminada';
  eliminada_en: string;
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

export interface OperationalStatus {
  recibiendo_pedidos: boolean;
  sesion_caja_abierta: boolean;
  caja_en_linea: boolean;
  cocina_en_linea: boolean;
  tiempo_estimado_min: number | null;
  consultado_en: string;
}

export interface OrderSpace {
  id: number;
  nombre: string;
  tipo: 'mesa' | 'barra' | 'cancha' | 'drive_thru';
}

export interface OrderItemOption {
  opcion_id: number;
  nombre: string;
  precio_extra: string;
}

export interface OrderItem {
  id: number;
  producto_id: number;
  nombre_producto: string;
  estacion_preparacion: 'cocina' | 'caja';
  cantidad: number;
  precio_digital_unitario: string;
  subtotal: string;
  opciones: OrderItemOption[];
}

export interface OrderDetail {
  id: string;
  folio: number;
  fecha_operativa: string;
  estado: OrderStatus;
  metodo_pago: PaymentMethod;
  destino: OrderDestination;
  espacio: OrderSpace | null;
  subtotal: string;
  ahorro_combinado: string;
  cashback_otorgado: string;
  total: string;
  version: number;
  creado_en: string;
  actualizado_en: string;
  notas_cocina: string | null;
  usuario: {
    nombre: string;
    matricula: string | null;
  } | null;
  items: OrderItem[];
  vence_operacion_en?: string | null;
  motivo_pendiente_operativo?: 'caja_inactiva' | 'cocina_inactiva' | null;
}

export interface CashPaymentResult {
  pedido: OrderDetail;
  monto_recibido: string;
  cambio: string;
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

export interface AnalyticsPeriod {
  desde: string;
  hasta: string;
}

export interface AnalyticsSummary {
  ventas_totales: string;
  pedidos: number;
  ticket_promedio: string;
  productos_vendidos: number;
  recargas: string;
  compras_saldo?: string;
  cashback_otorgado?: string;
  cancelaciones_wallet?: string;
  pedidos_cancelados?: number;
  comisiones: string;
  ventas_brutas_stripe?: string;
  costo_procesamiento_stripe?: string;
  impuesto_stripe?: string;
  comision_vaiinilla?: string;
  deducciones_totales?: string;
  neto_establecimiento?: string;
  ingreso_vaiinilla?: string;
  diferencia_estimado_real?: string;
}

export interface StripeFinancialAnalytics {
  ventas_brutas: string;
  costo_procesamiento: string;
  impuesto: string;
  comision_vaiinilla: string;
  deducciones_totales: string;
  neto_establecimiento: string;
  saldo_disponible_en_stripe: string | null;
  saldo_pendiente_en_stripe: string | null;
  saldo_total_en_stripe: string | null;
  saldo_pendiente_periodo_estimado: string;
  saldo_fuente: 'stripe_balance' | 'stripe_disabled' | 'account_unavailable' | 'currency_unavailable' | 'stripe_unavailable';
  payout_enviado_banco: string;
  diferencia_estimado_real: string;
  conciliaciones_pendientes: number;
}

export type WalletMovementType =
  'recarga_efectivo' | 'compra' | 'cashback' | 'cancelacion' | 'ajuste';

export interface WalletMovementMetric {
  tipo: WalletMovementType;
  monto: string;
  operaciones: number;
}

export interface WalletReconciliationMetric {
  wallets_revisadas: number;
  alertas: number;
}

export interface WalletAnalytics {
  movimientos: WalletMovementMetric[];
  conciliacion: WalletReconciliationMetric;
}

export interface CashbackRule {
  id: string;
  nombre: string;
  porcentaje: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  dias_activos: number[] | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface CashbackRuleInput {
  nombre: string;
  porcentaje: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  dias_activos: number[] | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  activa: boolean;
}

export interface DailySalesMetric {
  fecha: string;
  ventas: string;
  pedidos: number;
}

export interface PaymentMethodMetric {
  metodo: PaymentMethod;
  ventas: string;
  pedidos: number;
}

export interface OrderStatusMetric {
  estado: OrderStatus;
  pedidos: number;
}

export interface ProductMetric {
  producto_id: number;
  nombre: string;
  cantidad: number;
}

export interface TenantAnalytics {
  periodo: AnalyticsPeriod;
  resumen: AnalyticsSummary;
  ventas_por_dia: DailySalesMetric[];
  metodos_pago: PaymentMethodMetric[];
  pedidos_por_estado: OrderStatusMetric[];
  productos: ProductMetric[];
  wallet?: WalletAnalytics;
  stripe?: StripeFinancialAnalytics;
  calculado_en: string;
}

export interface PlatformOperationMetrics {
  establecimientos_activos: number;
  establecimientos_suspendidos: number;
  invitaciones_pendientes: number;
  sesiones_caja_abiertas: number;
  establecimientos_recibiendo: number;
  establecimientos_sin_operacion: number;
}

export interface PlatformEstablishmentMetric {
  id: string;
  nombre: string;
  slug: string;
  estado: 'activo' | 'suspendido';
  ventas: string;
  pedidos: number;
  ticket_promedio: string;
  sesion_caja_abierta: boolean;
  recibiendo_pedidos: boolean;
}

export interface PlatformAnalytics extends TenantAnalytics {
  operacion: PlatformOperationMetrics;
  establecimientos: PlatformEstablishmentMetric[];
}

export type SpaceType = 'mesa' | 'barra' | 'cancha' | 'drive_thru';

export interface ManagedSpace {
  id: number;
  nombre: string;
  tipo: SpaceType;
  activo: boolean;
  qr_url: string;
}

export type StripeOnboardingStatus =
  | 'pendiente'
  | 'en_revision'
  | 'habilitada'
  | 'restringida'
  | 'deshabilitada';

export interface PlatformStripeSummary {
  stripe_account_id: string;
  stripe_enabled: boolean;
  estado_onboarding: StripeOnboardingStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requisitos_actuales: Record<string, unknown>;
  capacidades: Record<string, unknown>;
  razon_deshabilitacion: string | null;
  livemode: boolean;
}

export interface StripeOnboarding {
  stripe_account_id: string;
  account_link_url: string;
  account_link_expires_at: number;
  estado_onboarding: StripeOnboardingStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

export interface StripePlatformConfiguration {
  stripe_enabled: boolean;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  estado_onboarding: StripeOnboardingStatus;
}

export interface PlatformEstablishment {
  id: string;
  nombre: string;
  slug: string;
  zona_horaria: string;
  hora_cierre_forzado: string;
  identificador_cliente_etiqueta: string;
  identificador_cliente_obligatorio: boolean;
  descripcion?: string | null;
  imagen_url?: string | null;
  direccion?: string | null;
  horario?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  tiktok_url?: string | null;
  whatsapp_url?: string | null;
  sitio_web_url?: string | null;
  estado: 'activo' | 'suspendido';
  suspendido_en: string | null;
  motivo_suspension: string | null;
  creado_en: string;
  stripe?: PlatformStripeSummary | null;
}

export interface EstablishmentInput {
  nombre: string;
  slug: string;
  zona_horaria: string;
  hora_cierre_forzado: string;
  identificador_cliente_etiqueta: string;
  identificador_cliente_obligatorio: boolean;
  descripcion?: string | null;
  imagen_url?: string | null;
  direccion?: string | null;
  horario?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  tiktok_url?: string | null;
  whatsapp_url?: string | null;
  sitio_web_url?: string | null;
}

export interface CatalogCategory {
  id: number;
  nombre: string;
  orden: number;
}

export interface CatalogOption {
  id: number;
  nombre: string;
  precio_extra: string;
}

export interface CatalogOptionGroup {
  id: number;
  nombre: string;
  min_selecciones: number;
  max_selecciones: number;
  opciones: CatalogOption[];
}

export interface CatalogProduct {
  id: number;
  categoria_id: number;
  estacion_preparacion: 'cocina' | 'caja';
  nombre: string;
  descripcion: string | null;
  ingredientes: string | null;
  alergenos: string | null;
  tiempo_estimado_min: number;
  precio_mostrador: string;
  precio_digital: string;
  disponible: boolean;
  imagen_url: string | null;
  grupos_opcion: CatalogOptionGroup[];
}

export interface CatalogResponse {
  categorias: CatalogCategory[];
  productos: CatalogProduct[];
}

export interface CatalogOptionInput {
  id?: number;
  nombre: string;
  precio_extra: string;
}

export interface CatalogOptionGroupInput {
  id?: number;
  nombre: string;
  min_selecciones: number;
  max_selecciones: number;
  opciones: CatalogOptionInput[];
}

export interface CatalogProductInput {
  categoria_id: number;
  estacion_preparacion: 'cocina' | 'caja';
  nombre: string;
  descripcion: string | null;
  ingredientes: string | null;
  alergenos: string | null;
  tiempo_estimado_min: number;
  precio_mostrador: string;
  disponible: boolean;
  grupos_opcion: CatalogOptionGroupInput[];
}

export interface CatalogCategoryInput {
  nombre: string;
  orden: number;
}
