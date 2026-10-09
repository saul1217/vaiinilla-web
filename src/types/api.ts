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
export type OperationalOrderStatus =
  | 'recibido'
  | 'preparando'
  | 'listo'
  | 'entregado'
  | 'cancelado'
  | 'no_recogido'
  | 'expirado';
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado' | 'reembolsado' | 'sin_cargo';
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
  /** Franjas en las que el negocio recibe pedidos; vacío = sin límite. */
  franjas_pedido?: { desde: string; hasta: string }[];
  /** false = ahora está fuera de esas franjas (por eso no recibe pedidos). */
  dentro_de_franja?: boolean;
  /** false = el personal entrega en el espacio sin pedir el QR. Un backend anterior no lo manda. */
  entrega_requiere_qr?: boolean;
}

export interface OrderSpace {
  id: number;
  nombre: string;
  tipo: 'mesa' | 'barra' | 'cancha' | 'drive_thru' | 'asiento';
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
  /** Instrucciones o comentarios especiales del artículo. */
  notas?: string | null;
  /** Rechazo por artículo: ya no cuenta en el total. */
  rechazo?: { motivo: string; monto: string } | null;
}

export interface OrderDetail {
  id: string;
  folio: number;
  fecha_operativa: string;
  estado: OrderStatus;
  estado_operativo?: OperationalOrderStatus;
  estado_pago?: PaymentStatus;
  metodo_pago: PaymentMethod;
  destino: OrderDestination;
  espacio: OrderSpace | null;
  subtotal: string;
  ahorro_combinado: string;
  cashback_otorgado: string;
  total: string;
  /** Importes oficiales derivados en backend del ledger de pagos y reembolsos. */
  monto_pagado?: string;
  monto_reembolsado?: string;
  saldo_pendiente?: string;
  /** Cuenta diferida: se liquida desde la cuenta de mesa, no por pedido. */
  pago_diferido?: boolean;
  pago_pendiente?: boolean;
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
  /** Drive-thru: cuándo el cliente avisó que llegó por su pedido; null si no ha avisado. */
  llegada_en?: string | null;
  /** Compra sin cuenta: pedido de un invitado (solo dio su nombre). */
  invitado?: boolean;
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
  /** Propinas del periodo: del negocio, fuera de ventas y sin comisión. */
  propinas?: string;
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
  estado: OperationalOrderStatus;
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

export type SpaceType = 'mesa' | 'barra' | 'cancha' | 'drive_thru' | 'asiento';

/** Resultado de crear espacios numerados en lote. */
export interface SpaceBatchResult {
  tipo: SpaceType;
  solicitados: number;
  creados: number;
  omitidos: string[];
}

export interface ManagedSpace {
  id: number;
  nombre: string;
  tipo: SpaceType;
  activo: boolean;
  qr_url: string;
  /** Código corto (4 dígitos) que se imprime junto al QR. Un backend anterior no lo manda. */
  codigo?: string | null;
  /** Precio por hora para rentar la cancha ("300.00"); null = no se renta. */
  precio_hora: string | null;
  /** Ficha que ven los clientes antes de rentar. Opcional: un backend anterior no la manda. */
  descripcion?: string | null;
  imagen_url?: string | null;
  caracteristicas?: string[];
}

export interface SpaceUpdateInput {
  nombre?: string;
  tipo?: SpaceType;
  activo?: boolean;
  precio_hora?: string | null;
  descripcion?: string | null;
  caracteristicas?: string[];
}

/** Video del local: enlace https que la página del negocio muestra a los clientes. */
export interface StoreVideo {
  titulo: string;
  url: string;
}

/** Cómo funciona el negocio (guía "Flujo de mi tienda"). Solo la administración. */
export interface BusinessSettings {
  tipo: string;
  entrega_requiere_qr: boolean;
  permite_pago_al_final: boolean;
  /** Si el negocio permite recargas y compras con saldo / wallet. */
  permite_saldo?: boolean;
  gracia_liberacion_min: number;
  /** Un backend anterior no lo manda: se toma como sin límite de horario. */
  franjas_pedido?: { desde: string; hasta: string }[];
  /** Aparece en el directorio público de Vaiinilla (oculto por defecto). */
  visible_en_directorio?: boolean;
  /** Enlace al menú de la tienda, para su QR general. Solo lectura. */
  tienda_url?: string | null;
  /** Videos del local (hasta 5). Un backend anterior no lo manda: se toma como lista vacía. */
  videos_local?: StoreVideo[];
  tipos_disponibles: string[];
}

export type BusinessSettingsInput = Partial<Omit<BusinessSettings, 'tipos_disponibles' | 'tienda_url'>>;

/** Una cuenta abierta (pagar al final) que nadie ha cobrado. */
export interface UnpaidAccount {
  espacio: { id: number; nombre: string; tipo: SpaceType };
  pedidos: number;
  total: string;
  desde: string;
  horas: number;
  clientes: string[];
  /** El espacio ya se liberó y la cuenta sigue sin pagar: alguien se fue sin pagar. */
  abandonada: boolean;
}

export interface UnpaidAccounts {
  cuentas: UnpaidAccount[];
  total: string;
  abandonadas: number;
}

/** Estado de un espacio: libre, con turno, en gracia o con la cuenta pendiente al terminar. */
export type SpaceOccupancy = 'libre' | 'ocupada' | 'en_gracia' | 'por_cobrar';

/** Un espacio en el mapa de disponibilidad (GET /espacios/disponibilidad). */
export interface SpaceAvailability {
  espacio: OrderSpace;
  estado: SpaceOccupancy;
  saldada: boolean;
  inicio: string | null;
  fin_previsto: string | null;
  /** Precio por hora: solo las canchas que se rentan. */
  precio_hora: string | null;
  proxima_reserva: { inicio: string; fin: string; estado: string } | null;
}

export interface SpaceAccountOrder {
  id: string;
  folio: number;
  estado: OrderStatus;
  estado_operativo?: OperationalOrderStatus;
  estado_pago?: PaymentStatus;
  total: number;
  monto_pagado?: number;
  monto_reembolsado?: number;
  saldo_pendiente?: number;
  pago_diferido: boolean;
  pendiente_cobro: boolean;
  cliente: { nombre: string } | null;
  items_resumen: string;
  creado_en: string;
  /** "Esto lo pago yo": el alias de quien dijo que paga este pedido. */
  pagara?: string | null;
}

/** Un abono (dividir por monto o partes) aún sin liquidar. */
export interface SpaceAccountAbono {
  id: string;
  metodo_pago: AccountPaymentMethod;
  monto: number;
  creado_en: string;
}

/** Un grupo de la cuenta por persona (GET /espacios/:id/sesion, GET /espacios/:id/sesiones/:sesionId/cuenta). */
export interface SpaceAccountGroup {
  etiqueta: string;
  participante_id: string | null;
  /** Ids de pedidos del grupo (agrupación por id, nunca por texto). */
  pedidos: string[];
  total: number;
  pagado: number;
  pendiente: number;
}

/** La cuenta de una sesión (abierta o cerrada): sus pedidos y, si el backend lo manda, sus grupos por persona. */
export interface SpaceAccount {
  pedidos: SpaceAccountOrder[];
  /** Opcional: un backend anterior no lo manda y el panel se ve como hoy. */
  grupos?: SpaceAccountGroup[];
  total: number;
  pendiente: number;
  pagado: number;
  saldada: boolean;
  /** Ya recibido en abonos; los pedidos se cobran al cubrir todo. */
  abonado?: number;
  /** Pendiente menos abonado. */
  restante?: number;
  abonos?: SpaceAccountAbono[];
}

/** La sesión abierta de un espacio y su cuenta (GET /espacios/:id/sesion). */
export interface SpaceSessionDetail {
  espacio: OrderSpace;
  estado: SpaceOccupancy;
  saldada: boolean;
  fin_previsto: string | null;
  sesion: { id: string; estado: string; inicio: string; fin_previsto: string | null; version: number } | null;
  cuenta: SpaceAccount | null;
}

export interface SessionStaffOrderInput {
  sessionId: string;
  participantId: string | null;
  items: Array<{ producto_id: number; cantidad: number; opcion_ids: number[]; notas?: string }>;
  notas_cocina?: string | null;
}

/** La cuenta de una sesión cerrada (GET /espacios/:id/sesiones/:sesionId/cuenta): mismo `cuenta` con `grupos`. */
export interface ClosedSpaceSessionDetail {
  espacio: OrderSpace;
  sesion: NonNullable<SpaceSessionDetail['sesion']>;
  cuenta: SpaceAccount;
}

export type AccountPaymentMethod = 'efectivo' | 'terminal';

export interface AccountCollection {
  pedidos_cobrados: number;
  total: string;
  metodo_pago: AccountPaymentMethod;
  monto_recibido: string | null;
  cambio: string;
  /** Lo que sigue sin cobrar de la cuenta: "0.00" si quedó saldada. */
  restante: string;
  propina?: string;
}

export type AbonoMode = 'monto' | 'partes';

/** POST /espacios/:id/sesion/abonos. */
export interface AccountAbonoResult {
  abono: { id: string; metodo_pago: AccountPaymentMethod; monto: string; monto_recibido: string | null; cambio: string };
  restante: string;
  propina?: string;
  liquidada: boolean;
  pedidos_cobrados: number;
}

/** Una renta de cancha apartada en mostrador, esperando su cobro. */
export interface CounterRental {
  id: string;
  espacio: OrderSpace;
  inicio: string;
  fin: string;
  duracion_min: number;
  monto: string;
  estado: string;
  version: number;
}

export interface CounterRentalPayment {
  reserva: CounterRental;
  cobro: { monto_recibido: string; cambio: string } | null;
}

export interface BookingSettings {
  apertura: string;
  cierre: string;
  dias_adelanto: number;
  zona_horaria: string;
}

export interface BookingSettingsInput {
  apertura: string;
  cierre: string;
  dias_adelanto: number;
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

/** La tarjeta del negocio vista por su dueño (GET /stripe/configuracion). */
export interface TenantCardPayments {
  stripe_enabled: boolean;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  estado_onboarding: StripeOnboardingStatus;
  /** Si es true, el pago con tarjeta suma la comisión al precio; si no, el cliente paga el de mostrador. */
  pasar_comision_al_cliente?: boolean;
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
  tipo?: EstablishmentType;
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
  identificador_cliente_etiqueta?: string;
  identificador_cliente_obligatorio?: boolean;
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
  tipo?: EstablishmentType;
}

export type EstablishmentType = 'cafeteria' | 'restaurante' | 'padel';

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

export type RefundMethod = 'efectivo' | 'terminal' | 'otro';

/** Dinero que el negocio debe regresar a mano; Caja lo confirma al devolverlo. */
export interface PendingRefund {
  id: string;
  origen: 'sobrante_cuenta' | 'rechazo_articulo' | 'cancelacion';
  espacio_id: number | null;
  pedido_id: string | null;
  /** efectivo, terminal, saldo o una mezcla ("efectivo+terminal"). */
  metodo_original: string;
  monto: string;
  estado: 'pendiente' | 'devuelta';
  creado_en: string;
  metodo_devolucion: RefundMethod | null;
  nota: string | null;
  devuelta_en: string | null;
}

/** Respuesta de quitar un artículo: cómo se devuelve lo que ya se pagó. */
export interface ItemRejectionResult {
  rechazo: {
    pedido_item_id: number;
    motivo: string;
    monto: string;
    /** ninguno: no se había pagado; efectivo: salió del cajón; stripe: reembolso; manual: tarea de Caja. */
    metodo_reembolso: 'ninguno' | 'efectivo' | 'stripe' | 'manual';
    stripe_refund_id: string | null;
  };
  /** Solo con metodo_reembolso = manual: la devolución que Caja debe entregar y confirmar. */
  devolucion?: PendingRefund | null;
}
