import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AccountDeletion,
  CashSession,
  CashPaymentResult,
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
  BookingSettingsInput,
  ManagedSpace,
  BusinessSettings,
  BusinessSettingsInput,
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
  SpaceAvailability,
  SpaceSessionDetail,
  SessionStaffOrderInput,
  ClosedSpaceSessionDetail,
  TenantCardPayments,
  ItemRejectionResult,
  PendingRefund,
  RefundMethod,
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
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { token, body, idempotent, idempotencyKey, ...requestOptions } = options;
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
  async getLegalVersions(): Promise<LegalVersions> {
    return (await request<LegalVersions>('/publico/legal/vigente')).data;
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
  ): Promise<StaffInvitation> {
    return (
      await request<StaffInvitation>('/personal/invitaciones', {
        method: 'POST',
        token,
        idempotent: true,
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
      estado_operativo?: import('../types/api').OperationalOrderStatus[];
      actualizadoDesde?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ orders: OrderDetail[]; cursor: string | null }> {
    const response = await request<OrderDetail[]>(
      `/pedidos${params({
        estado: options.estado?.join(','),
        estado_operativo: options.estado_operativo?.join(','),
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

  async createCategory(token: string, input: CatalogCategoryInput): Promise<CatalogCategory> {
    return (
      await request<CatalogCategory>('/catalogo/categorias', {
        method: 'POST',
        token,
        idempotent: true,
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

  async createProduct(token: string, input: CatalogProductInput): Promise<CatalogProduct> {
    return (
      await request<CatalogProduct>('/catalogo/productos', {
        method: 'POST',
        token,
        idempotent: true,
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

  async createSessionOrder(
    token: string,
    spaceId: number,
    input: SessionStaffOrderInput,
    idempotencyKey: string,
  ): Promise<OrderDetail> {
    return (
      await request<OrderDetail>(`/espacios/${spaceId}/sesion/pedidos`, {
        method: 'POST',
        token,
        idempotencyKey,
        body: {
          sesion_id: input.sessionId,
          participante_id: input.participantId,
          items: input.items,
          notas_cocina: input.notas_cocina ?? null,
        },
      })
    ).data;
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

  /** Aparta una cancha en mostrador: `inicio` null = ahora; el fin del turno = renovar. */
  async startCounterRental(
    token: string,
    input: { espacioId: number; duracionMin: number; inicio: string | null },
  ): Promise<CounterRental> {
    return (
      await request<CounterRental>('/reservas', {
        method: 'POST',
        token,
        idempotent: true,
        body: { espacio_id: input.espacioId, duracion_min: input.duracionMin, ...(input.inicio ? { inicio: input.inicio } : {}) },
      })
    ).data;
  },

  /** Cobra en efectivo la renta apartada: con el cobro se ocupa la cancha o se alarga su turno. */
  async payCounterRental(token: string, rentalId: string, montoRecibido: string): Promise<CounterRentalPayment> {
    return (
      await request<CounterRentalPayment>(`/reservas/${rentalId}/pago`, {
        method: 'POST',
        token,
        idempotent: true,
        body: { metodo_pago: 'efectivo', monto_recibido: montoRecibido },
      })
    ).data;
  },

  /** Suelta el horario apartado si no se cobró. */
  async cancelCounterRental(token: string, rentalId: string): Promise<void> {
    await request(`/reservas/${rentalId}/cancelacion`, { method: 'POST', token, idempotent: true });
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
    input: { tipo: SpaceType; prefijo: string; desde: number; hasta: number },
  ): Promise<SpaceBatchResult> {
    return (await request<SpaceBatchResult>('/espacios/lote', { method: 'POST', token, idempotent: true, body: input })).data;
  },

  async createSpace(token: string, input: { nombre: string; tipo: SpaceType }): Promise<ManagedSpace> {
    return (await request<ManagedSpace>('/espacios', { method: 'POST', token, idempotent: true, body: input })).data;
  },

  async updateSpace(
    token: string,
    id: number,
    input: SpaceUpdateInput,
  ): Promise<ManagedSpace> {
    return (await request<ManagedSpace>(`/espacios/${id}`, { method: 'PATCH', token, idempotent: true, body: input })).data;
  },

  async businessSettings(token: string): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { token })).data;
  },

  async saveBusinessSettings(token: string, input: BusinessSettingsInput): Promise<BusinessSettings> {
    return (await request<BusinessSettings>('/establecimiento/configuracion', { method: 'PATCH', token, body: input })).data;
  },

  async uploadSpaceImage(token: string, id: number, file: File): Promise<ManagedSpace> {
    const body = new FormData();
    body.append('imagen', file);
    return (await request<ManagedSpace>(`/espacios/${id}/imagen`, { method: 'PUT', token, idempotent: true, body })).data;
  },

  async deleteSpaceImage(token: string, id: number): Promise<ManagedSpace> {
    return (await request<ManagedSpace>(`/espacios/${id}/imagen`, { method: 'DELETE', token, idempotent: true })).data;
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
};
