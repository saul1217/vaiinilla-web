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
  TenantContextResponse,
  TenantAnalytics,
} from '../types/api';

const fallbackApiUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const apiUrl = (import.meta.env.VITE_API_URL || fallbackApiUrl).replace(/\/$/, '');

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
  ): Promise<CashPaymentResult> {
    return (
      await request<CashPaymentResult>(`/pedidos/${id}/cobros-efectivo`, {
        method: 'POST',
        token,
        idempotent: true,
        body: {
          monto_recibido: montoRecibido,
          version_esperada: versionEsperada,
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
