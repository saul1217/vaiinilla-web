import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import {
  clearMixedPaymentAttempt,
  isCompleteScope,
  listPendingMixedPaymentAttempts,
  mixedPaymentLockName,
  mixedPaymentUnavailableKey,
  readMixedPaymentAttempt,
  writeMixedPaymentAttempt,
  type MixedPaymentAttempt,
  type MixedPaymentScope,
} from './mixed-payment-attempts';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AccountDeletion,
  CashSession,
  CashPaymentResult,
  MixedPaymentResult,
  StaffOrderInput,
  StaffOrderResult,
  CashbackRule,
  CashbackRuleInput,
  CatalogCategory,
  CatalogCategoryInput,
  CatalogProduct,
  CatalogProductInput,
  CatalogResponse,
  EstablishmentInput,
  IdentityRegistration,
  IdentityRegistrationInput,
  InvitationAcceptance,
  InvitationRole,
  InvitationStatus,
  PlatformContextResponse,
  PlatformAnalytics,
  PlatformEstablishment,
  PlatformSummary,
  StripeOnboarding,
  StripePlatformConfiguration,
  LegalVersions,
  OperationalRole,
  OperationalStatus,
  OrderDetail,
  OrderStatus,
  SessionAccess,
  StaffInvitation,
  StaffMembership,
  TenantContextResponse,
  TenantAnalytics,
  BookingSettings,
  CourtAvailabilityDay,
  BookingSettingsInput,
  ManagedSpace,
  BusinessSettings,
  BusinessSettingsInput,
  OperationalSettings,
  SpaceUpdateInput,
  UnpaidAccounts,
  SpaceBatchResult,
  SpaceType,
  AbonoMode,
  AccountAbonoResult,
  AccountCollection,
  AccountPaymentMethod,
  CounterRental,
  CounterRentalPayment,
  StaffBooking,
  BookingRefund,
  BookingRefundInput,
  SpaceAvailability,
  SpaceSessionDetail,
  ClosedSpaceSessionDetail,
  TenantCardPayments,
  ItemRejectionResult,
  PendingRefund,
  RefundMethod,
  StoreImageKind,
  StoreAssistantFile,
  StoreAssistantMessage,
  StoreAssistantReply,
  InventoryMovementInput,
  InventoryOverview,
  InventoryProduct,
  InventorySupply,
  InventorySupplyInput,
  RecipeLine,
  RecipeLineInput,
  StaffBookingInput,
  VilloDevice,
  VilloDeviceAlert,
  VilloDeviceTokenIssued,
  VilloDeviceUpdateInput,
  HotelRoom,
  HotelRoomBatchInput,
  HotelRoomBatchResult,
  HotelSettings,
  HotelSettingsInput,
  HotelSummary,
  WalletCashRecharge,
  WalletClient,
  WalletClientDetail,
  SchoolDayClosure,
  SchoolGuardianRequest,
  SchoolGuardianship,
  SchoolMenuDays,
  SchoolReservedDay,
  SchoolRoster,
  SchoolRosterStudent,
  SchoolSettingsInput,
  SchoolStudentRequest,
} from '../types/api';

// La URL del backend sale de VITE_API_URL: .env.development para `npm run dev` y
// Vercel para cada ambiente (Production → app, Preview → dev.vaiinilla.app y PRs).
export function resolveApiUrl(envUrl: string | undefined): string {
  const url = envUrl?.trim().replace(/\/$/, '');
  if (!url) {
    throw new Error('Falta VITE_API_URL: configúrala en .env.development o en Vercel.');
  }
  return url;
}

const apiUrl = resolveApiUrl(import.meta.env.VITE_API_URL);

/** Base URL of the backend API, for modules (e.g. mesero-api.ts) that need to fetch directly. */
export { apiUrl };

interface RequestOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: unknown;
  idempotent?: boolean;
  idempotencyKey?: string;
  expectedStatus?: number;
}

const mixedPaymentLocks = new Map<string, Promise<void>>();

async function withMixedPaymentLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) return locks.request(key, run);

  const previous = mixedPaymentLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  mixedPaymentLocks.set(key, queued);
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (mixedPaymentLocks.get(key) === queued) mixedPaymentLocks.delete(key);
  }
}

/** Negocio y usuario de la sesión que cobra; el entorno lo pone el cliente (apiUrl). */
export interface MixedPaymentOwner {
  establecimientoId: string;
  usuarioId: string;
}

function mixedPaymentScope(owner: MixedPaymentOwner): MixedPaymentScope {
  const scope = { apiUrl, establecimientoId: owner.establecimientoId, usuarioId: owner.usuarioId };
  if (!isCompleteScope(scope)) throw new Error('No se pudo identificar la sesión de Caja. Vuelve a entrar antes de cobrar.');
  return scope;
}

function sameMixedPaymentBody(a: MixedPaymentAttempt['body'], b: MixedPaymentAttempt['body']): boolean {
  return a.metodo_pago === b.metodo_pago && a.monto === b.monto && (a.monto_recibido ?? '') === (b.monto_recibido ?? '');
}

/** Manda el intento guardado con su llave. Solo se llama dentro del candado del pedido. */
async function sendMixedPaymentAttempt(token: string, attempt: MixedPaymentAttempt): Promise<MixedPaymentResult> {
  try {
    const result = await request<MixedPaymentResult>(`/pedidos/${attempt.orderId}/pagos-mixtos`, {
      method: 'POST',
      token,
      idempotencyKey: attempt.idempotencyKey,
      body: attempt.body,
    });
    writeMixedPaymentAttempt({ ...attempt, completedRemaining: result.data.restante });
    return result.data;
  } catch (error) {
    // Estos estados rechazan la solicitud sin aplicar el pago. Un 409 puede
    // ser una repetición cuyo resultado se perdió, así que conserva la clave.
    if (error instanceof VaiinillaApiError && [400, 404, 422].includes(error.status)) {
      clearMixedPaymentAttempt(attempt.scope, attempt.orderId);
    }
    throw error;
  }
}

/** Pago mixto con otro pago del mismo pedido aún sin confirmar: hay que reintentar ese primero. */
export class MixedPaymentPendingError extends Error {
  constructor() {
    super('Este pedido tiene un pago pendiente de confirmar. Reintenta ese mismo pago antes de registrar otro.');
    this.name = 'MixedPaymentPendingError';
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { token, body, idempotent, idempotencyKey, expectedStatus, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  else if (idempotent) headers.set('Idempotency-Key', createIdempotencyKey());

  const response = await fetch(`${apiUrl}${path}`, {
    ...requestOptions,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new VaiinillaApiError(response.status, {
      code: 'HTTP_ERROR',
      message: 'El servidor devolvió un estado inesperado.',
    });
  }

  if (response.ok && response.status === 204) {
    return { data: undefined as T, meta: {}, error: null };
  }

  const payload = (await response.json().catch(() => null)) as
    ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok || !payload || payload.error) {
    const error = payload?.error ?? {
      code: 'HTTP_ERROR',
      message: 'El servidor no devolvió una respuesta válida.',
    };
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new VaiinillaApiError(response.status, error, retryAfter);
  }

  return payload;
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  /** Intento sin confirmar del pedido para esta sesión (entorno, negocio y usuario), si hay. */
  pendingMixedPayment(owner: MixedPaymentOwner, orderId: string): MixedPaymentAttempt | null {
    try {
      const attempt = readMixedPaymentAttempt(mixedPaymentScope(owner), orderId);
      return attempt?.completedRemaining === undefined ? attempt : null;
    } catch {
      return null;
    }
  },

  /** El backend de esta sesión (entorno, negocio y usuario) ya respondió que no tiene el pago mixto. */
  isMixedPaymentUnavailable(owner: MixedPaymentOwner): boolean {
    try {
      return window.sessionStorage.getItem(mixedPaymentUnavailableKey(mixedPaymentScope(owner))) === '1';
    } catch {
      return false;
    }
  },

  /** Lo recuerda en la pestaña para no volver a intentar el endpoint al cerrar y abrir el cobro. */
  markMixedPaymentUnavailable(owner: MixedPaymentOwner): void {
    try {
      window.sessionStorage.setItem(mixedPaymentUnavailableKey(mixedPaymentScope(owner)), '1');
    } catch {
      // Sin almacenamiento solo dura lo que dure la página.
    }
  },

  /**
   * Reenvía, uno por uno y con su misma llave, solo los intentos sin confirmar de
   * esta sesión. Nunca crea un intento nuevo: si otra pestaña ya lo resolvió, lo salta.
   */
  async recoverPendingMixedPayments(
    token: string,
    owner: MixedPaymentOwner,
  ): Promise<Array<{ orderId: string; result: MixedPaymentResult }>> {
    const scope = mixedPaymentScope(owner);
    const recovered: Array<{ orderId: string; result: MixedPaymentResult }> = [];
    for (const { orderId } of listPendingMixedPaymentAttempts(scope)) {
      try {
        const result = await withMixedPaymentLock(mixedPaymentLockName(scope, orderId), async () => {
          const attempt = readMixedPaymentAttempt(scope, orderId);
          if (!attempt || attempt.completedRemaining !== undefined) return null;
          return sendMixedPaymentAttempt(token, attempt);
        });
        if (result) recovered.push({ orderId, result });
      } catch {
        // Queda guardado (salvo rechazo definitivo) y se reintenta desde el pedido o en la siguiente carga.
      }
    }
    return recovered;
  },

  async getLegalVersions(): Promise<LegalVersions> {
    return (await request<LegalVersions>('/publico/legal/vigente')).data;
  },

  /**
   * Registra el token FCM de este navegador. Upsert repetible, sin Idempotency-Key:
   * se llama al entrar y cada vez que FCM rota el token.
   */
  async registerDevice(token: string, fcmToken: string): Promise<void> {
    await request<void>('/devices', {
      method: 'POST',
      token,
      body: { fcmToken, plataforma: 'web' },
    });
  },

  /** Baja el token al cerrar sesión, para no seguir avisando a quien ya salió. */
  async unregisterDevice(token: string, fcmToken: string): Promise<void> {
    await request<void>(`/devices/${encodeURIComponent(fcmToken)}`, {
      method: 'DELETE',
      token,
    });
  },

  async requestEmailVerification(firebaseToken: string): Promise<void> {
    await request<{ aceptado: true }>('/publico/correos/verificacion', {
      method: 'POST',
      token: firebaseToken,
    });
  },

  async requestPasswordRecovery(email: string): Promise<void> {
    await request<{ aceptado: true }>('/publico/correos/recuperacion', {
      method: 'POST',
      body: { email },
    });
  },

  async registerIdentity(
    firebaseToken: string,
    input: IdentityRegistrationInput,
  ): Promise<IdentityRegistration> {
    return (
      await request<IdentityRegistration>('/identidad/alta', {
        method: 'POST',
        token: firebaseToken,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async deleteOwnAccount(
    firebaseToken: string,
    idempotencyKey: string,
  ): Promise<AccountDeletion> {
    return (
      await request<AccountDeletion>('/identidad/cuenta', {
        method: 'DELETE',
        token: firebaseToken,
        idempotencyKey,
        body: { confirmacion: 'ELIMINAR' },
      })
    ).data;
  },

  async acceptInvitation(
    firebaseToken: string,
    invitationToken: string,
  ): Promise<InvitationAcceptance> {
    return (
      await request<InvitationAcceptance>('/invitaciones/aceptar', {
        method: 'POST',
        token: firebaseToken,
        idempotent: true,
        body: { token: invitationToken },
      })
    ).data;
  },

  async listAccesses(firebaseToken: string): Promise<SessionAccess[]> {
    return (
      await request<SessionAccess[]>('/sesiones/accesos', {
        token: firebaseToken,
      })
    ).data;
  },

  async createTenantContext(
    firebaseToken: string,
    membresiaId: string,
  ): Promise<TenantContextResponse> {
    return (
      await request<TenantContextResponse>('/sesiones/contexto', {
        method: 'POST',
        token: firebaseToken,
        body: { membresia_id: membresiaId },
      })
    ).data;
  },

  async listInvitations(
    token: string,
    options: {
      estado?: InvitationStatus;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ invitations: StaffInvitation[]; cursor: string | null }> {
    const response = await request<StaffInvitation[]>(`/personal/invitaciones${params(options)}`, {
      token,
    });
    return { invitations: response.data, cursor: response.meta.cursor ?? null };
  },

  async createInvitation(
    token: string,
    input: { email: string; rol: InvitationRole },
    idempotencyKey?: string,
  ): Promise<StaffInvitation> {
    return (
      await request<StaffInvitation>('/personal/invitaciones', {
        method: 'POST',
        token,
        idempotent: true,
        idempotencyKey,
        body: input,
      })
    ).data;
  },

  async revokeInvitation(token: string, id: string): Promise<StaffInvitation> {
    return (
      await request<StaffInvitation>(`/personal/invitaciones/${id}/revocar`, {
        method: 'POST',
        token,
        idempotent: true,
      })
    ).data;
  },

  async resendInvitation(token: string, id: string): Promise<StaffInvitation> {
    return (
      await request<StaffInvitation>(`/personal/invitaciones/${id}/reenviar`, {
        method: 'POST',
        token,
        idempotent: true,
      })
    ).data;
  },

  async listStaffMemberships(token: string): Promise<StaffMembership[]> {
    return (await request<StaffMembership[]>('/personal/invitaciones/membresias', { token })).data;
  },

  async updateStaffMembership(token: string, id: string, rol: InvitationRole): Promise<StaffMembership> {
    return (await request<StaffMembership>(`/personal/invitaciones/membresias/${id}`, {
      method: 'PATCH', token, idempotent: true, body: { rol },
    })).data;
  },

  async deactivateStaffMembership(token: string, id: string): Promise<StaffMembership> {
    return (await request<StaffMembership>(`/personal/invitaciones/membresias/${id}/desactivar`, {
      method: 'POST', token, idempotent: true,
    })).data;
  },

  async activeCashSession(token: string): Promise<CashSession | null> {
    return (await request<CashSession | null>('/sesiones-caja/activa', { token })).data;
  },

  async openCashSession(token: string, montoInicial: string): Promise<CashSession> {
    return (
      await request<CashSession>('/sesiones-caja', {
        method: 'POST',
        token,
        idempotent: true,
        body: { monto_inicial: montoInicial },
      })
    ).data;
  },

  async closeCashSession(
    token: string,
    sessionId: string,
    montoFinal: string,
  ): Promise<CashSession> {
    return (
      await request<CashSession>(`/sesiones-caja/${sessionId}/cerrar`, {
        method: 'POST',
        token,
        idempotent: true,
        body: { monto_final: montoFinal },
      })
    ).data;
  },

  async operationalStatus(token: string): Promise<OperationalStatus> {
    return (await request<OperationalStatus>('/estado-operativo', { token })).data;
  },

  async tenantAnalytics(
    token: string,
    period: { desde: string; hasta: string },
  ): Promise<TenantAnalytics> {
    return (
      await request<TenantAnalytics>(`/reportes/resumen${params(period)}`, {
        token,
      })
    ).data;
  },

  async cashbackRule(token: string): Promise<CashbackRule | null> {
    return (await request<CashbackRule | null>('/wallets/reglas-cashback', { token })).data;
  },

  async configureCashback(token: string, input: CashbackRuleInput): Promise<CashbackRule> {
    return (
      await request<CashbackRule>('/wallets/reglas-cashback', {
        method: 'POST',
        token,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async listOrders(
    token: string,
    options: {
      estado?: OrderStatus[];
      actualizadoDesde?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ orders: OrderDetail[]; cursor: string | null }> {
    const response = await request<OrderDetail[]>(
      `/pedidos${params({
        estado: options.estado?.join(','),
        actualizado_desde: options.actualizadoDesde,
        cursor: options.cursor,
        limit: options.limit,
      })}`,
      { token },
    );
    return { orders: response.data, cursor: response.meta.cursor ?? null };
  },

  async getOrder(token: string, id: string): Promise<OrderDetail> {
    return (await request<OrderDetail>(`/pedidos/${id}`, { token })).data;
  },

  async collectCash(
    token: string,
    id: string,
    montoRecibido: string,
    versionEsperada: number,
    propina?: string,
  ): Promise<CashPaymentResult> {
    return (
      await request<CashPaymentResult>(`/pedidos/${id}/cobros-efectivo`, {
        method: 'POST',
        token,
        idempotent: true,
        body: {
          monto_recibido: montoRecibido,
          version_esperada: versionEsperada,
          ...(propina && propina !== '0.00' ? { propina } : {}),
        },
      })
    ).data;
  },

  async payOrderMixed(
    token: string,
    owner: MixedPaymentOwner,
    id: string,
    input: { metodoPago: 'efectivo' | 'terminal'; monto: string; montoRecibido?: string },
    expectedRemaining: string,
  ): Promise<MixedPaymentResult> {
    const scope = mixedPaymentScope(owner);
    const requestedBody = {
      metodo_pago: input.metodoPago,
      monto: input.monto,
      ...(input.metodoPago === 'efectivo' && input.montoRecibido
        ? { monto_recibido: input.montoRecibido }
        : {}),
    };
    return withMixedPaymentLock(mixedPaymentLockName(scope, id), async () => {
      let attempt = readMixedPaymentAttempt(scope, id);
      if (attempt?.completedRemaining !== undefined) {
        // A stale tab must not turn its old balance into a second charge.
        if (attempt.completedRemaining !== expectedRemaining) {
          throw new Error('El saldo del pedido cambió en otra pestaña. Actualiza Caja antes de cobrar de nuevo.');
        }
        attempt = null;
      }
      if (attempt && !sameMixedPaymentBody(attempt.body, requestedBody)) {
        // Otro pago del pedido (otra pestaña o una respuesta perdida) sigue sin confirmar.
        throw new MixedPaymentPendingError();
      }
      if (!attempt) {
        attempt = {
          version: 2,
          scope,
          orderId: id,
          idempotencyKey: createIdempotencyKey(),
          body: requestedBody,
          expectedRemaining,
          createdAt: Date.now(),
        };
        writeMixedPaymentAttempt(attempt);
      }
      return sendMixedPaymentAttempt(token, attempt);
    });
  },

  /** La llave la pone quien llama: los reintentos del mismo pedido deben reenviar la misma. */
  async createStaffOrder(
    token: string,
    input: StaffOrderInput,
    idempotencyKey: string,
  ): Promise<StaffOrderResult> {
    return (
      await request<StaffOrderResult>('/pedidos', {
        method: 'POST',
        token,
        idempotencyKey,
        body: input,
      })
    ).data;
  },

  async deliverOrder(
    token: string,
    id: string,
    versionEsperada: number,
    qrToken: string,
  ): Promise<OrderDetail> {
    return api.transitionOrder(token, id, 'entregado', versionEsperada, qrToken);
  },

  async transitionOrder(
    token: string,
    id: string,
    targetStatus: Extract<OrderStatus, 'preparando' | 'listo' | 'entregado'>,
    expectedVersion: number,
    pickupToken?: string,
  ): Promise<OrderDetail> {
    return (
      await request<OrderDetail>(`/pedidos/${id}/transiciones`, {
        method: 'POST',
        token,
        idempotent: true,
        body: {
          estado_objetivo: targetStatus,
          version_esperada: expectedVersion,
          ...(pickupToken ? { qr_token: pickupToken } : {}),
        },
      })
    ).data;
  },

  async heartbeat(token: string, dispositivo: string, rol: OperationalRole): Promise<void> {
    await request<void>('/latidos', {
      method: 'POST',
      token,
      body: { dispositivo, rol },
    });
  },

  async catalog(token: string): Promise<CatalogResponse> {
    return (await request<CatalogResponse>('/catalogo', { token })).data;
  },

  async createCategory(token: string, input: CatalogCategoryInput, idempotencyKey?: string): Promise<CatalogCategory> {
    return (
      await request<CatalogCategory>('/catalogo/categorias', {
        method: 'POST',
        token,
        idempotent: true,
        idempotencyKey,
        body: input,
      })
    ).data;
  },

  async updateCategory(
    token: string,
    id: number,
    input: Partial<CatalogCategoryInput>,
  ): Promise<CatalogCategory> {
    return (
      await request<CatalogCategory>(`/catalogo/categorias/${id}`, {
        method: 'PATCH',
        token,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async createProduct(token: string, input: CatalogProductInput, idempotencyKey?: string): Promise<CatalogProduct> {
    return (
      await request<CatalogProduct>('/catalogo/productos', {
        method: 'POST',
        token,
        idempotent: true,
        idempotencyKey,
        body: input,
      })
    ).data;
  },

  async updateProduct(
    token: string,
    id: number,
    input: CatalogProductInput,
  ): Promise<CatalogProduct> {
    return (
      await request<CatalogProduct>(`/catalogo/productos/${id}`, {
        method: 'PUT',
        token,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async changeProductAvailability(
    token: string,
    id: number,
    disponible: boolean,
  ): Promise<CatalogProduct> {
    return (
      await request<CatalogProduct>(`/catalogo/productos/${id}/disponibilidad`, {
        method: 'POST',
        token,
        idempotent: true,
        body: { disponible },
      })
    ).data;
  },

  async uploadProductImage(token: string, id: number, file: File): Promise<CatalogProduct> {
    const body = new FormData();
    body.append('imagen', file);
    return (
      await request<CatalogProduct>(`/catalogo/productos/${id}/imagen`, {
        method: 'PUT',
        token,
        idempotent: true,
        body,
      })
    ).data;
  },

  async deleteProductImage(token: string, id: number): Promise<CatalogProduct> {
    return (
      await request<CatalogProduct>(`/catalogo/productos/${id}/imagen`, {
        method: 'DELETE',
        token,
        idempotent: true,
      })
    ).data;
  },

  async createPlatformContext(firebaseToken: string): Promise<PlatformContextResponse> {
    return (
      await request<PlatformContextResponse>('/plataforma/sesiones/contexto', {
        method: 'POST',
        token: firebaseToken,
      })
    ).data;
  },

  async platformSummary(token: string): Promise<PlatformSummary> {
    return (await request<PlatformSummary>('/plataforma/resumen', { token })).data;
  },

  async platformAnalytics(
    token: string,
    period: { desde: string; hasta: string },
  ): Promise<PlatformAnalytics> {
    return (await request<PlatformAnalytics>(`/plataforma/metricas${params(period)}`, { token }))
      .data;
  },

  async listEstablishments(
    token: string,
    options: {
      estado?: 'activo' | 'suspendido';
      query?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{
    establishments: PlatformEstablishment[];
    cursor: string | null;
  }> {
    const response = await request<PlatformEstablishment[]>(
      `/plataforma/establecimientos${params(options)}`,
      { token },
    );
    return {
      establishments: response.data,
      cursor: response.meta.cursor ?? null,
    };
  },

  async createEstablishment(
    token: string,
    input: EstablishmentInput,
  ): Promise<PlatformEstablishment> {
    return (
      await request<PlatformEstablishment>('/plataforma/establecimientos', {
        method: 'POST',
        token,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async updateEstablishment(
    token: string,
    id: string,
    input: Partial<EstablishmentInput>,
  ): Promise<PlatformEstablishment> {
    return (
      await request<PlatformEstablishment>(`/plataforma/establecimientos/${id}`, {
        method: 'PATCH',
        token,
        idempotent: true,
        body: input,
      })
    ).data;
  },

  async changeEstablishmentStatus(
    token: string,
    id: string,
    action: 'suspender' | 'reactivar',
    motivo: string,
  ): Promise<PlatformEstablishment> {
    return (
      await request<PlatformEstablishment>(`/plataforma/establecimientos/${id}/${action}`, {
        method: 'POST',
        token,
        idempotent: true,
        body: { motivo },
      })
    ).data;
  },

  async inviteFirstAdmin(token: string, id: string, email: string): Promise<StaffInvitation> {
    return (
      await request<StaffInvitation>(
        `/plataforma/establecimientos/${id}/primer-administrador/invitaciones`,
        {
          method: 'POST',
          token,
          idempotent: true,
          body: { email },
        },
      )
    ).data;
  },

  async listManagedSpaces(token: string): Promise<ManagedSpace[]> {
    return (await request<ManagedSpace[]>('/espacios/administracion', { token })).data;
  },

  async unpaidAccounts(token: string): Promise<UnpaidAccounts> {
    return (await request<UnpaidAccounts>('/espacios/cuentas-sin-pagar', { token })).data;
  },

  /** Cocina rechaza un pedido que no puede preparar; el cliente ve el motivo. */
  async rejectOrder(token: string, id: string, expectedVersion: number, motivo: string): Promise<void> {
    await request(`/pedidos/${id}/cancelaciones`, {
      method: 'POST',
      token,
      idempotent: true,
      body: { version_esperada: expectedVersion, motivo },
    });
  },

  /** Rechaza un solo artículo con motivo; el total baja y se devuelve esa parte. */
  async rejectOrderItem(
    token: string,
    id: string,
    itemId: number,
    expectedVersion: number,
    motivo: string,
  ): Promise<ItemRejectionResult> {
    return (
      await request<ItemRejectionResult>(`/pedidos/${id}/articulos/${itemId}/rechazos`, {
        method: 'POST',
        token,
        idempotent: true,
        body: { version_esperada: expectedVersion, motivo },
      })
    ).data;
  },

  async spaceAvailability(token: string): Promise<SpaceAvailability[]> {
    return (await request<SpaceAvailability[]>('/espacios/disponibilidad', { token })).data;
  },

  /** Devoluciones pendientes (sobrante de cuenta, artículo o pedido quitado ya pagado). */
  async pendingRefunds(token: string, spaceId?: number): Promise<PendingRefund[]> {
    const query = spaceId ? `?espacio_id=${spaceId}` : '';
    return (await request<PendingRefund[]>(`/devoluciones${query}`, { token, cache: 'no-store' })).data;
  },

  /** Caja confirma que ya devolvió el dinero; en efectivo sale del cajón. */
  async confirmRefund(token: string, id: string, metodo: RefundMethod, nota?: string): Promise<PendingRefund> {
    return (
      await request<PendingRefund>(`/devoluciones/${id}/confirmaciones`, {
        token,
        method: 'POST',
        idempotent: true,
        body: { metodo, ...(nota ? { nota } : {}) },
      })
    ).data;
  },

  async spaceSession(token: string, spaceId: number): Promise<SpaceSessionDetail> {
    return (await request<SpaceSessionDetail>(`/espacios/${spaceId}/sesion`, { token })).data;
  },

  /** Cuenta de una sesión cerrada (reimpresión del ticket histórico, agrupada por persona). */
  async getClosedSessionAccount(
    token: string,
    spaceId: number,
    sessionId: string,
  ): Promise<ClosedSpaceSessionDetail> {
    return (
      await request<ClosedSpaceSessionDetail>(`/espacios/${spaceId}/sesiones/${sessionId}/cuenta`, {
        token,
      })
    ).data;
  },

  /**
   * Cobra la cuenta del espacio (pagar al final): toda, o solo `pedidoIds` para dividirla.
   * Con la terminal no hay efectivo recibido ni cambio.
   */
  /** Abona a la cuenta por monto o en partes iguales; al cubrir todo, la cuenta se liquida. */
  async abonarSpaceAccount(
    token: string,
    spaceId: number,
    input: {
      metodo: AccountPaymentMethod;
      modo: AbonoMode;
      monto?: string;
      partes?: number;
      montoRecibido?: string;
      restanteEsperado: string;
      propina?: string;
    },
  ): Promise<AccountAbonoResult> {
    return (
      await request<AccountAbonoResult>(`/espacios/${spaceId}/sesion/abonos`, {
        method: 'POST',
        token,
        idempotent: true,
        body: {
          metodo_pago: input.metodo,
          modo: input.modo,
          ...(input.modo === 'monto' ? { monto: input.monto } : { partes: input.partes }),
          ...(input.metodo === 'efectivo' ? { monto_recibido: input.montoRecibido } : {}),
          restante_esperado: input.restanteEsperado,
          ...(input.propina && input.propina !== '0.00' ? { propina: input.propina } : {}),
        },
      })
    ).data;
  },

  async collectSpaceAccount(
    token: string,
    spaceId: number,
    input: { metodo: AccountPaymentMethod; montoRecibido?: string; totalEsperado: string; pedidoIds?: string[]; propina?: string },
  ): Promise<AccountCollection> {
    return (
      await request<AccountCollection>(`/espacios/${spaceId}/sesion/cobros`, {
        method: 'POST',
        token,
        idempotent: true,
        body: {
          metodo_pago: input.metodo,
          ...(input.metodo === 'efectivo' ? { monto_recibido: input.montoRecibido } : {}),
          total_esperado: input.totalEsperado,
          ...(input.pedidoIds ? { pedido_ids: input.pedidoIds } : {}),
          ...(input.propina && input.propina !== '0.00' ? { propina: input.propina } : {}),
        },
      })
    ).data;
  },

  /** Libera el espacio. El backend lo rechaza con pedidos sin cobrar. */
  async releaseSpace(token: string, spaceId: number, version?: number, force = false, note?: string): Promise<void> {
    await request(`/espacios/${spaceId}/sesion/cierres`, {
      method: 'POST',
      token,
      idempotent: true,
      body: { ...(version ? { version } : {}), ...(force ? { forzar: true } : {}), ...(force && note ? { nota: note } : {}) },
    });
  },

  /**
   * Aparta una cancha en mostrador: `inicio` null = ahora; el fin del turno = renovar.
   * En un boliche van los `jugadores` (el servidor responde PLAYERS_REQUIRED sin ellos, salvo al renovar).
   */
  async startCounterRental(
    token: string,
    input: { espacioId: number; duracionMin: number; inicio: string | null; jugadores?: number; nombreCliente?: string },
    idempotencyKey?: string,
  ): Promise<CounterRental> {
    const name = input.nombreCliente?.trim();
    return (
      await request<CounterRental>('/reservas', {
        method: 'POST',
        token,
        idempotent: true,
        idempotencyKey,
        body: {
          espacio_id: input.espacioId,
          duracion_min: input.duracionMin,
          ...(input.inicio ? { inicio: input.inicio } : {}),
          ...(input.jugadores ? { jugadores: input.jugadores } : {}),
          ...(name ? { nombre_cliente: name } : {}),
        },
      })
    ).data;
  },

  /**
   * Cobra en efectivo la renta apartada: con el cobro se ocupa la cancha o se alarga su turno.
   * Un reintento del mismo cobro debe mandar la misma `idempotencyKey` para no cobrar dos veces.
   */
  async payCounterRental(token: string, rentalId: string, montoRecibido: string, idempotencyKey?: string): Promise<CounterRentalPayment> {
    return (
      await request<CounterRentalPayment>(`/reservas/${rentalId}/pago`, {
        method: 'POST',
        token,
        idempotent: true,
        idempotencyKey,
        body: { metodo_pago: 'efectivo', monto_recibido: montoRecibido },
      })
    ).data;
  },

  /** Suelta el horario apartado si no se cobró. */
  /** Sin `refund` cancela una reserva por pagar; con él cancela una pagada y reembolsa de 0 al total pagado. */
  async cancelCounterRental(token: string, rentalId: string, refund?: BookingRefundInput, idempotencyKey?: string): Promise<void> {
    await request(`/reservas/${rentalId}/cancelacion`, {
      method: 'POST',
      token,
      idempotent: true,
      idempotencyKey,
      body: refund ? { motivo: refund.motivo, monto_reembolso: refund.monto_reembolso } : undefined,
    });
  },

  /** Reporte de reembolsos de reservas de cancha (solo Administración del negocio). */
  async listBookingRefunds(token: string): Promise<BookingRefund[]> {
    return (await request<BookingRefund[]>('/reservas/reembolsos', { token })).data;
  },

  /** Horario reservable y lo ocupado de cada cancha en un día; sin `date` el back usa hoy. */
  async courtAvailability(token: string, date?: string): Promise<CourtAvailabilityDay> {
    const query = date ? `?fecha=${encodeURIComponent(date)}` : '';
    return (await request<CourtAvailabilityDay>(`/reservas/disponibilidad${query}`, { token, cache: 'no-store' })).data;
  },

  /** Reservas de cancha del día (de clientes y de mostrador). `date` = YYYY-MM-DD. */
  async listStaffBookings(token: string, date: string): Promise<StaffBooking[]> {
    return (await request<StaffBooking[]>(`/reservas?fecha=${encodeURIComponent(date)}`, { token })).data;
  },

  /** `null` = el negocio todavía no conecta su cuenta de Stripe. */
  async cardPayments(token: string): Promise<TenantCardPayments | null> {
    return (await request<TenantCardPayments | null>('/stripe/configuracion', { token })).data;
  },

  /** Enlace de Stripe para conectar la cuenta o completar lo que falta. */
  async startCardPaymentsOnboarding(token: string): Promise<StripeOnboarding> {
    return (await request<StripeOnboarding>('/stripe/onboarding', { method: 'POST', token, idempotent: true })).data;
  },

  async setCardPayments(token: string, enabled: boolean): Promise<TenantCardPayments> {
    return (
      await request<TenantCardPayments>('/stripe/configuracion', {
        method: 'PATCH',
        token,
        idempotent: true,
        body: { stripe_enabled: enabled },
      })
    ).data;
  },

  /** El dueño decide si la comisión de la tarjeta se suma al precio (apagado por defecto). */
  async setCardCommissionPassThrough(token: string, pass: boolean): Promise<TenantCardPayments> {
    return (
      await request<TenantCardPayments>('/stripe/comision-al-cliente', {
        method: 'PATCH',
        token,
        idempotent: true,
        body: { pasar_comision_al_cliente: pass },
      })
    ).data;
  },

  async createSpaceBatch(
    token: string,
    input: { tipo: SpaceType; prefijo: string; desde: number; hasta: number; capacidad?: number },
    idempotencyKey?: string,
  ): Promise<SpaceBatchResult> {
    return (await request<SpaceBatchResult>('/espacios/lote', { method: 'POST', token, idempotent: true, idempotencyKey, body: input })).data;
  },

  async createSpace(token: string, input: { nombre: string; tipo: SpaceType }): Promise<ManagedSpace> {
    return (await request<ManagedSpace>('/espacios', { method: 'POST', token, idempotent: true, body: input })).data;
  },

  async updateSpace(
    token: string,
    id: number,
    input: SpaceUpdateInput,
    idempotencyKey?: string,
  ): Promise<ManagedSpace> {
    return (await request<ManagedSpace>(`/espacios/${id}`, { method: 'PATCH', token, idempotent: true, idempotencyKey, body: input })).data;
  },

  async businessSettings(token: string): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { token })).data;
  },

  async operationalSettings(token: string): Promise<OperationalSettings> {
    return (await request<OperationalSettings>('/establecimiento/configuracion/operativa', { token })).data;
  },

  async saveBusinessSettings(token: string, input: BusinessSettingsInput): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { method: 'PATCH', token, body: input })).data;
  },

  async setOfflinePause(token: string, enabled: boolean): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { method: 'PATCH', token, body: { pausa_sin_conexion: enabled } })).data;
  },

  /**
   * Los Excel van en `archivos` en cada mensaje (hasta 3, 2 MB cada uno); sin Excel no se manda la clave.
   * `signal` corta la llamada si el usuario cambia de sesión o de negocio antes de que conteste.
   */
  async askStoreAssistant(
    token: string,
    messages: StoreAssistantMessage[],
    files: StoreAssistantFile[] = [],
    signal?: AbortSignal,
  ): Promise<StoreAssistantReply> {
    const body = files.length ? { mensajes: messages, archivos: files } : { mensajes: messages };
    return (await request<StoreAssistantReply>('/establecimiento/asistente', { method: 'POST', token, body, signal })).data;
  },

  /** Insumos activos del inventario (GET /inventario/insumos). */
  async inventorySupplies(token: string): Promise<InventorySupply[]> {
    return (await request<{ insumos: InventorySupply[] }>('/inventario/insumos', { token })).data.insumos;
  },

  async createInventorySupply(token: string, input: InventorySupplyInput, idempotencyKey?: string): Promise<InventorySupply> {
    return (await request<InventorySupply>('/inventario/insumos', { method: 'POST', token, idempotent: true, idempotencyKey, body: input })).data;
  },

  /** Entrada, merma o conteo. El `id` (UUID) evita que un reintento lo cuente dos veces. */
  async registerInventoryMovement(token: string, input: InventoryMovementInput): Promise<void> {
    await request('/inventario/movimientos', { method: 'POST', token, idempotencyKey: input.id, body: input });
  },

  /** Productos del menú vistos desde inventario (id y nombre, con o sin receta). */
  async inventoryProducts(token: string): Promise<InventoryProduct[]> {
    return (await request<{ productos: InventoryProduct[] }>('/inventario/productos', { token })).data.productos;
  },

  async productRecipe(token: string, productId: number): Promise<RecipeLine[]> {
    return (await request<{ producto_id: number; lineas: RecipeLine[] }>(`/inventario/productos/${productId}/receta`, { token })).data.lineas;
  },

  /** Reemplaza la receta completa del producto. */
  async saveProductRecipe(token: string, productId: number, lines: RecipeLineInput[], idempotencyKey?: string): Promise<void> {
    await request(`/inventario/productos/${productId}/receta`, { method: 'PUT', token, idempotent: true, idempotencyKey, body: { lineas: lines } });
  },

  /** Aparta una pista u horario para alguien que llamó; queda por cobrar en Caja con `markBookingCashLater`. */
  async createStaffBooking(token: string, input: StaffBookingInput, idempotencyKey?: string): Promise<CounterRental> {
    return (await request<CounterRental>('/reservas', { method: 'POST', token, idempotent: true, idempotencyKey, body: input })).data;
  },

  /** Efectivo sin monto: la renta queda por cobrar en Caja, como una renta de mostrador. */
  async markBookingCashLater(token: string, bookingId: string, idempotencyKey?: string): Promise<void> {
    await request(`/reservas/${bookingId}/pago`, { method: 'POST', token, idempotent: true, idempotencyKey, body: { metodo_pago: 'efectivo' } });
  },

  async uploadStoreImage(token: string, kind: StoreImageKind, file: File): Promise<BusinessSettings> {
    const body = new FormData();
    body.append('imagen', file);
    return (await request<BusinessSettings>(`/establecimiento/${kind}`, { method: 'PUT', token, idempotent: true, body })).data;
  },

  async deleteStoreImage(token: string, kind: StoreImageKind): Promise<BusinessSettings> {
    return (await request<BusinessSettings>(`/establecimiento/${kind}`, { method: 'DELETE', token, idempotent: true })).data;
  },

  async uploadSpaceImage(token: string, id: number, file: File): Promise<ManagedSpace> {
    const body = new FormData();
    body.append('imagen', file);
    return (await request<ManagedSpace>(`/espacios/${id}/imagen`, { method: 'PUT', token, idempotent: true, body })).data;
  },

  async deleteSpaceImage(token: string, id: number): Promise<ManagedSpace> {
    return (await request<ManagedSpace>(`/espacios/${id}/imagen`, { method: 'DELETE', token, idempotent: true })).data;
  },

  async deleteSpace(token: string, id: number): Promise<{ id: number; eliminado: boolean }> {
    return (await request<{ id: number; eliminado: boolean }>(`/espacios/${id}`, { method: 'DELETE', token, idempotent: true })).data;
  },

  async bookingSettings(token: string): Promise<BookingSettings> {
    return (await request<BookingSettings>('/reservas/configuracion', { token })).data;
  },

  async saveBookingSettings(token: string, input: BookingSettingsInput): Promise<BookingSettings> {
    return (await request<BookingSettings>('/reservas/configuracion', { method: 'PUT', token, idempotent: true, body: input })).data;
  },

  async rotateSpaceQr(token: string, id: number): Promise<ManagedSpace> {
    return (await request<ManagedSpace>(`/espacios/${id}/rotar-token`, { method: 'POST', token, idempotent: true })).data;
  },

  async createPlatformStripeOnboarding(
    token: string,
    id: string,
    idempotencyKey: string,
  ): Promise<StripeOnboarding> {
    return (
      await request<StripeOnboarding>(
        `/plataforma/establecimientos/${id}/stripe/onboarding`,
        {
          method: 'POST',
          token,
          idempotencyKey,
        },
      )
    ).data;
  },

  async uploadEstablishmentImage(
    token: string,
    id: string,
    file: File,
  ): Promise<PlatformEstablishment> {
    const body = new FormData();
    body.append('imagen', file);
    return (
      await request<PlatformEstablishment>(`/plataforma/establecimientos/${id}/imagen`, {
        method: 'PUT',
        token,
        idempotent: true,
        body,
      })
    ).data;
  },

  async resolveMapsLink(token: string, url: string): Promise<{ latitud: number; longitud: number }> {
    return (
      await request<{ latitud: number; longitud: number }>('/plataforma/establecimientos/resolver-maps', {
        method: 'POST',
        token,
        body: { url },
      })
    ).data;
  },

  async linkExistingPlatformStripe(
    token: string,
    id: string,
    stripeAccountId?: string,
  ): Promise<StripePlatformConfiguration> {
    return (
      await request<StripePlatformConfiguration>(
        `/plataforma/establecimientos/${id}/stripe/vincular-existente`,
        {
          method: 'POST',
          token,
          idempotent: true,
          body: stripeAccountId ? { stripe_account_id: stripeAccountId } : {},
        },
      )
    ).data;
  },

  async getPlatformStripeConfiguration(
    token: string,
    id: string,
  ): Promise<StripePlatformConfiguration | null> {
    return (
      await request<StripePlatformConfiguration | null>(
        `/plataforma/establecimientos/${id}/stripe`,
        { token },
      )
    ).data;
  },

  async cashDayCut(token: string, date?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return (await request<Record<string, unknown>>(`/sesiones-caja/cortes${params({ fecha: date })}`, { token, signal })).data;
  },

  async cashSessionCut(token: string, sessionId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return (await request<Record<string, unknown>>(`/sesiones-caja/${encodeURIComponent(sessionId)}/corte`, { token, signal })).data;
  },

  async accountingReport(token: string, from: string, to: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return (await request<Record<string, unknown>>(`/reportes/contable${params({ desde: from, hasta: to })}`, { token, signal })).data;
  },

  /**
   * Pantalla de inventario: insumos con existencia y, desde la migración 205, `permisos`
   * (`puede_editar` de esta sesión y `cocina_edita` del negocio). Un backend anterior no los manda.
   */
  async inventoryOverview(token: string): Promise<InventoryOverview> {
    return (await request<InventoryOverview>('/inventario/insumos', { token })).data;
  },

  /** Solo admin: deja o no a Cocina editar el inventario (`cocina_edita_inventario`, migración 205). */
  async setInventoryKitchenPermission(token: string, allow: boolean): Promise<{ cocina_edita: boolean }> {
    return (await request<{ cocina_edita: boolean }>('/inventario/permisos', { method: 'PATCH', token, body: { cocina_edita: allow } })).data;
  },

  async configurePlatformStripe(
    token: string,
    id: string,
    stripeEnabled: boolean,
    idempotencyKey: string,
  ): Promise<StripePlatformConfiguration> {
    return (
      await request<StripePlatformConfiguration>(
        `/plataforma/establecimientos/${id}/stripe/configuracion`,
        {
          method: 'PATCH',
          token,
          idempotencyKey,
          body: { stripe_enabled: stripeEnabled },
        },
      )
    ).data;
  },

  /** Acceso del dueño de la plataforma a la sección Villo (204 = permitido). */
  async villoOwnerAccess(token: string | null | undefined): Promise<void> {
    await request<void>('/villo/owner/acceso', {
      token: token ?? '',
      expectedStatus: 204,
    });
  },

  /** Guía en Markdown para el dueño de la plataforma. */
  async villoOwnerGuide(
    token: string | null | undefined,
  ): Promise<{ markdown: string; actualizado_en: string }> {
    return (
      await request<{ markdown: string; actualizado_en: string }>(
        '/villo/owner/guia',
        { token: token ?? '' },
      )
    ).data;
  },
  /** VILLO del negocio (rol admin, token de contexto del negocio). Nunca trae tokens. */
  async listVilloDevices(token: string): Promise<VilloDevice[]> {
    return (await request<VilloDevice[]>('/villo/dispositivos', { token })).data;
  },

  async createVilloDevice(
    token: string,
    input: { nombre: string; espacio_id?: number | null },
  ): Promise<VilloDevice> {
    return (
      await request<VilloDevice>('/villo/dispositivos', { method: 'POST', token, body: input })
    ).data;
  },

  async updateVilloDevice(
    token: string,
    id: string,
    input: VilloDeviceUpdateInput,
  ): Promise<VilloDevice> {
    return (
      await request<VilloDevice>(`/villo/dispositivos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        token,
        body: input,
      })
    ).data;
  },

  /** Token nuevo en claro, una sola vez (no-store). Invalida el anterior. No lo guardes. */
  async issueVilloDeviceToken(token: string, id: string): Promise<VilloDeviceTokenIssued> {
    return (
      await request<VilloDeviceTokenIssued>(
        `/villo/dispositivos/${encodeURIComponent(id)}/token`,
        { method: 'POST', token, cache: 'no-store' },
      )
    ).data;
  },

  async revokeVilloDevice(token: string, id: string, motivo?: string): Promise<VilloDevice> {
    return (
      await request<VilloDevice>(`/villo/dispositivos/${encodeURIComponent(id)}/revocar`, {
        method: 'POST',
        token,
        body: motivo ? { motivo } : {},
      })
    ).data;
  },

  async listVilloDeviceAlerts(token: string, id: string): Promise<VilloDeviceAlert[]> {
    return (
      await request<VilloDeviceAlert[]>(`/villo/dispositivos/${encodeURIComponent(id)}/alertas`, {
        token,
      })
    ).data;
  },

  /** Ajustes del hotel (cualquier rol). `activo: false` si el negocio no es hotel. */
  async hotelSettings(token: string): Promise<HotelSettings> {
    return (await request<HotelSettings>('/hotel/configuracion', { token })).data;
  },

  /** Admin, solo en un hotel. Se mezcla con lo guardado; esta ruta no pide Idempotency-Key. */
  async saveHotelSettings(token: string, input: HotelSettingsInput): Promise<HotelSettings> {
    return (await request<HotelSettings>('/hotel/configuracion', { method: 'PUT', token, body: input })).data;
  },

  /** Resumen del día del hotel (admin). */
  async hotelSummary(token: string): Promise<HotelSummary> {
    return (await request<HotelSummary>('/hotel/resumen', { token })).data;
  },

  /** Habitaciones del hotel; con rol admin trae `qr_url`. */
  async hotelRooms(token: string): Promise<HotelRoom[]> {
    return (await request<HotelRoom[]>('/habitaciones', { token })).data;
  },

  /** Alta en lote (admin, solo hotel). La llave la pone quien llama para reintentar el mismo lote. */
  async createHotelRooms(
    token: string,
    input: HotelRoomBatchInput,
    idempotencyKey: string,
  ): Promise<HotelRoomBatchResult> {
    return (
      await request<HotelRoomBatchResult>('/habitaciones/lote', {
        method: 'POST',
        token,
        body: input,
        idempotencyKey,
      })
    ).data;
  },

  /** Busca clientes del negocio por nombre o identificador (cajero o admin). `q` de 2 a 80 letras. */
  async searchWalletClients(token: string, query: string, signal?: AbortSignal): Promise<WalletClient[]> {
    return (await request<WalletClient[]>(`/wallets/clientes${params({ q: query.trim() })}`, { token, signal })).data;
  },

  /** Saldo y movimientos de un cliente (cajero o admin). `cursor` sale de `meta.cursor` de la página anterior. */
  async walletClientDetail(
    token: string,
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ data: WalletClientDetail; cursor: string | null }> {
    const response = await request<WalletClientDetail>(
      `/wallets/${encodeURIComponent(userId)}${params({ limit: options.limit, cursor: options.cursor })}`,
      { token },
    );
    return { data: response.data, cursor: response.meta?.cursor || null };
  },

  /**
   * Recarga en efectivo (solo cajero, con Caja abierta). La llave la pone quien llama y la guarda
   * antes de mandar: si se pierde la respuesta, reintentar con la misma no abona dos veces.
   */
  async rechargeWalletCash(token: string, userId: string, amount: string, idempotencyKey: string): Promise<WalletCashRecharge> {
    return (
      await request<WalletCashRecharge>(`/wallets/${encodeURIComponent(userId)}/recargas-efectivo`, {
        method: 'POST',
        token,
        body: { monto: amount },
        idempotencyKey,
      })
    ).data;
  },

  // region Escuela (admin). Cada cambio lleva la llave que pone quien llama, para reintentar sin duplicar.

  /** Código para unirse y reglas de la escuela; devuelve la configuración completa del negocio. */
  async saveSchoolSettings(token: string, input: SchoolSettingsInput, idempotencyKey: string): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { method: 'PATCH', token, body: input, idempotencyKey })).data;
  },

  /** Sin rango, de hoy al último día que se aparta; siempre trae el "hoy" de la escuela. */
  async schoolMenuDays(token: string, range?: { desde: string; hasta: string }): Promise<SchoolMenuDays> {
    return (await request<SchoolMenuDays>(`/menu-dias${range ? params(range) : ''}`, { token })).data;
  },

  /** Lista vacía: ese día se vende todo el menú. */
  async saveSchoolMenuDay(token: string, fecha: string, productIds: number[], idempotencyKey: string): Promise<void> {
    await request(`/menu-dias/${fecha}`, { method: 'PUT', token, body: { producto_ids: productIds }, idempotencyKey });
  },

  /** Cancela lo apartado de ese día y regresa el saldo. */
  async closeSchoolDay(token: string, fecha: string, motivo: string, idempotencyKey: string): Promise<SchoolDayClosure> {
    return (await request<SchoolDayClosure>(`/menu-dias/${fecha}/sin-servicio`, { method: 'PUT', token, body: { motivo }, idempotencyKey })).data;
  },

  async reopenSchoolDay(token: string, fecha: string, idempotencyKey: string): Promise<void> {
    await request(`/menu-dias/${fecha}/sin-servicio`, { method: 'DELETE', token, idempotencyKey });
  },

  async schoolReservedDay(token: string, fecha: string): Promise<SchoolReservedDay> {
    return (await request<SchoolReservedDay>(`/menu-dias/${fecha}/apartados`, { token })).data;
  },

  async schoolRoster(token: string): Promise<SchoolRoster> {
    return (await request<SchoolRoster>('/padron', { token })).data;
  },

  /** Reemplaza el padrón completo; vacío lo quita. */
  async saveSchoolRoster(token: string, alumnos: SchoolRosterStudent[], idempotencyKey: string): Promise<{ total: number }> {
    return (await request<{ total: number }>('/padron', { method: 'PUT', token, body: { alumnos }, idempotencyKey })).data;
  },

  /** Tutores que esperan a la escuela, del más viejo al más nuevo. */
  async schoolGuardianRequests(token: string): Promise<SchoolGuardianRequest[]> {
    return (await request<SchoolGuardianRequest[]>('/solicitudes-tutela', { token })).data;
  },

  async reviewSchoolGuardianRequest(token: string, tutelaId: string, approve: boolean, idempotencyKey: string): Promise<void> {
    await request(`/solicitudes-tutela/${tutelaId}/${approve ? 'aprobar' : 'rechazar'}`, { method: 'POST', token, body: {}, idempotencyKey });
  },

  /** Quién cuida a los alumnos cuyo nombre o matrícula coincide. */
  async searchSchoolGuardianships(token: string, query: string, signal?: AbortSignal): Promise<SchoolGuardianship[]> {
    return (await request<SchoolGuardianship[]>(`/solicitudes-tutela/tutores${params({ q: query })}`, { token, signal })).data;
  },

  async removeSchoolGuardianship(token: string, tutelaId: string, idempotencyKey: string): Promise<void> {
    await request(`/solicitudes-tutela/${tutelaId}/quitar`, { method: 'POST', token, body: {}, idempotencyKey });
  },

  async makeSchoolGuardianPrincipal(token: string, tutelaId: string, idempotencyKey: string): Promise<void> {
    await request(`/solicitudes-tutela/${tutelaId}/principal`, { method: 'POST', token, body: {}, idempotencyKey });
  },

  /** Devoluciones de saldo y bajas que esperan a la escuela. */
  async schoolStudentRequests(token: string): Promise<SchoolStudentRequest[]> {
    return (await request<SchoolStudentRequest[]>('/solicitudes-alumno', { token })).data;
  },

  async resolveSchoolStudentRequest(token: string, id: string, idempotencyKey: string): Promise<void> {
    await request(`/solicitudes-alumno/${id}/resolver`, { method: 'POST', token, body: {}, idempotencyKey });
  },

  async rejectSchoolStudentRequest(token: string, id: string, motivo: string, idempotencyKey: string): Promise<void> {
    await request(`/solicitudes-alumno/${id}/rechazar`, { method: 'POST', token, body: { motivo }, idempotencyKey });
  },

  // endregion
};
