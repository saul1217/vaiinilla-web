import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import type { PlatformEstablishment } from '../types/api';
import { EstablishmentsPage } from './establishments-page';

const apiMock = vi.hoisted(() => ({
  listEstablishments: vi.fn(),
  createPlatformStripeOnboarding: vi.fn(),
  getPlatformStripeConfiguration: vi.fn(),
  configurePlatformStripe: vi.fn(),
  createEstablishment: vi.fn(),
  updateEstablishment: vi.fn(),
  changeEstablishmentStatus: vi.fn(),
  inviteFirstAdmin: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  clearPlatform: vi.fn(),
}));
const windowOpenMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    platform: { token: 'platform-token' },
    clearPlatform: sessionMock.clearPlatform,
  }),
}));

const establishment: PlatformEstablishment = {
  id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
  nombre: 'Cafetería Demo A',
  slug: 'cafeteria-demo-a',
  zona_horaria: 'America/Mexico_City',
  hora_cierre_forzado: '18:00:00',
  identificador_cliente_etiqueta: 'Matrícula',
  identificador_cliente_obligatorio: true,
  estado: 'activo',
  suspendido_en: null,
  motivo_suspension: null,
  creado_en: '2026-08-21T12:00:00Z',
  stripe: null,
};

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage(
  row: PlatformEstablishment = establishment,
  includeLocation = false,
  configureList = true,
) {
  if (configureList) {
    apiMock.listEstablishments.mockResolvedValue({
      establishments: [row],
      cursor: null,
    });
  }
  return render(
    <MemoryRouter initialEntries={['/plataforma/establecimientos']}>
      <TestProvider>
        <EstablishmentsPage />
        {includeLocation && <LocationProbe />}
      </TestProvider>
    </MemoryRouter>,
  );
}

describe('onboarding Stripe en Super Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: windowOpenMock,
    });
    apiMock.getPlatformStripeConfiguration.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea el onboarding, usa una llave idempotente y deja un enlace recuperable', async () => {
    const accountLinkUrl = 'https://connect.stripe.test/setup/demo';
    apiMock.createPlatformStripeOnboarding.mockResolvedValue({
      stripe_account_id: 'acct_test_demo',
      account_link_url: accountLinkUrl,
      account_link_expires_at: 1780000000,
      estado_onboarding: 'pendiente',
      charges_enabled: false,
      payouts_enabled: false,
    });

    const actor = userEvent.setup();
    renderPage();

    await actor.click(await screen.findByRole('button', { name: 'Conectar Stripe' }));

    await waitFor(() =>
      expect(apiMock.createPlatformStripeOnboarding).toHaveBeenCalledWith(
        'platform-token',
        establishment.id,
        expect.any(String),
      ),
    );
    expect(windowOpenMock).toHaveBeenCalledWith(accountLinkUrl, '_blank', 'noopener,noreferrer');
    expect(await screen.findByRole('link', { name: /Abrir Account Link/ })).toHaveAttribute(
      'href',
      accountLinkUrl,
    );
  });

  it('solo muestra activar cuando Stripe ya confirmó cargos y transferencias', async () => {
    const readyEstablishment: PlatformEstablishment = {
      ...establishment,
      stripe: {
        stripe_account_id: 'acct_test_demo',
        stripe_enabled: false,
        estado_onboarding: 'habilitada',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requisitos_actuales: {},
        capacidades: { card_payments: 'active', transfers: 'active' },
        razon_deshabilitacion: null,
        livemode: false,
      },
    };
    apiMock.configurePlatformStripe.mockResolvedValue({
      stripe_enabled: true,
      stripe_account_id: 'acct_test_demo',
      charges_enabled: true,
      payouts_enabled: true,
      estado_onboarding: 'habilitada',
    });

    const actor = userEvent.setup();
    renderPage(readyEstablishment);
    await actor.click(await screen.findByRole('button', { name: 'Activar Stripe' }));

    await waitFor(() =>
      expect(apiMock.configurePlatformStripe).toHaveBeenCalledWith(
        'platform-token',
        establishment.id,
        true,
        expect.any(String),
      ),
    );
  });

  it('mantiene En revisión sin permitir activar localmente', async () => {
    renderPage({
      ...establishment,
      stripe: {
        stripe_account_id: 'acct_test_demo',
        stripe_enabled: false,
        estado_onboarding: 'en_revision',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        requisitos_actuales: {},
        capacidades: {},
        razon_deshabilitacion: null,
        livemode: false,
      },
    });

    expect(await screen.findByText('En revisión')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activar Stripe' })).not.toBeInTheDocument();
  });

  it('muestra el conflicto del backend si la cuenta deja de estar lista al activar', async () => {
    const readyEstablishment: PlatformEstablishment = {
      ...establishment,
      stripe: {
        stripe_account_id: 'acct_test_demo',
        stripe_enabled: false,
        estado_onboarding: 'habilitada',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requisitos_actuales: {},
        capacidades: { card_payments: 'active', transfers: 'active' },
        razon_deshabilitacion: null,
        livemode: false,
      },
    };
    apiMock.configurePlatformStripe.mockRejectedValue(
      new VaiinillaApiError(409, {
        code: 'STRIPE_ACCOUNT_NOT_READY',
        message: 'La cuenta conectada todavía no está habilitada para cobrar.',
      }),
    );

    const actor = userEvent.setup();
    renderPage(readyEstablishment);
    await actor.click(await screen.findByRole('button', { name: 'Activar Stripe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La cuenta conectada todavía no está habilitada para cobrar.',
    );
  });

  it('redirige al acceso y conserva el establecimiento cuando el JWT expira', async () => {
    apiMock.createPlatformStripeOnboarding.mockRejectedValue(
      new VaiinillaApiError(401, {
        code: 'UNAUTHENTICATED',
        message: 'Sesión expirada.',
      }),
    );

    const actor = userEvent.setup();
    renderPage(establishment, true);
    await actor.click(await screen.findByRole('button', { name: 'Conectar Stripe' }));

    await waitFor(() => expect(sessionMock.clearPlatform).toHaveBeenCalled());
    expect(screen.getByTestId('location')).toHaveTextContent('/plataforma/acceso');
    expect(
      JSON.parse(window.sessionStorage.getItem('vaiinilla_platform_stripe_return') ?? '{}'),
    ).toEqual({
      establishmentId: establishment.id,
    });
  });
});
