import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  platformCardApproval: vi.fn(),
  decidePlatformCardApproval: vi.fn(),
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

  it('en un restaurante no ofrece activar Stripe: la tarjeta solo va en cafeterías (back #268)', async () => {
    renderPage({
      ...establishment,
      nombre: 'Restaurante Demo',
      tipo: 'restaurante',
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
    });

    expect(await screen.findByText('Tarjeta solo en cafeterías')).toBeVisible();
    expect(screen.getByText(/solo se activan en cafeterías/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activar Stripe' })).not.toBeInTheDocument();
    expect(apiMock.configurePlatformStripe).not.toHaveBeenCalled();
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

describe('crear establecimiento en Super Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getPlatformStripeConfiguration.mockResolvedValue(null);
  });

  it('elige el tipo y no pide ni envía el identificador del cliente', async () => {
    const user = userEvent.setup();
    apiMock.createEstablishment.mockResolvedValue({ ...establishment, tipo: 'padel' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Crear establecimiento/ }));
    expect(screen.queryByLabelText('Etiqueta del identificador')).not.toBeInTheDocument();
    expect(screen.queryByText('Identificador obligatorio')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Pádel Norte');
    await user.type(screen.getByLabelText(/Slug/), 'padel-norte');
    await user.click(screen.getByRole('button', { name: /Tipo/ }));
    await user.click(await screen.findByRole('option', { name: 'Pádel' }));
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(apiMock.createEstablishment).toHaveBeenCalledTimes(1));
    const input = apiMock.createEstablishment.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(input).toMatchObject({ nombre: 'Pádel Norte', slug: 'padel-norte', tipo: 'padel' });
    expect(input).not.toHaveProperty('identificador_cliente_etiqueta');
    expect(input).not.toHaveProperty('identificador_cliente_obligatorio');
  });
});

describe('aprobación de tarjeta en Super Admin (cafeterías)', () => {
  const cafeteria: PlatformEstablishment = { ...establishment, tipo: 'cafeteria' };
  const sinAprobar = { estado: null, vigente: false, origen: null, aprobada_en: null, revocada_en: null };
  const aprobada = {
    estado: 'aprobada' as const,
    vigente: true,
    origen: 'plataforma' as const,
    aprobada_en: '2026-11-18T10:00:00Z',
    revocada_en: null,
  };
  const revocada = { ...aprobada, estado: 'revocada' as const, vigente: false, revocada_en: '2026-11-18T12:00:00Z' };
  const consulta = (aprobacion: typeof sinAprobar | typeof aprobada | typeof revocada, historial: unknown[] = []) => ({
    establecimiento_id: cafeteria.id,
    tipo: 'cafeteria',
    aprobable: true,
    aprobacion,
    stripe: null,
    historial,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getPlatformStripeConfiguration.mockResolvedValue(null);
  });

  it('solo las cafeterías consultan la aprobación', async () => {
    renderPage({ ...establishment, tipo: 'restaurante' });
    await screen.findByText('Cafetería Demo A');
    expect(screen.queryByRole('region', { name: 'Aprobación de tarjeta' })).not.toBeInTheDocument();
    expect(apiMock.platformCardApproval).not.toHaveBeenCalled();
  });

  it('aprueba con motivo obligatorio e Idempotency-Key, y muestra el estado nuevo', async () => {
    apiMock.platformCardApproval
      .mockResolvedValueOnce(consulta(sinAprobar))
      .mockResolvedValue(consulta(aprobada, [{ id: '1', accion: 'aprobar', motivo: 'Alta del lunes', creado_en: '2026-11-18T10:00:00Z' }]));
    apiMock.decidePlatformCardApproval.mockResolvedValue({ establecimiento_id: cafeteria.id, cambio: true, aprobacion: aprobada, stripe: null });
    const user = userEvent.setup();
    renderPage(cafeteria);

    const panel = await screen.findByRole('region', { name: 'Aprobación de tarjeta' });
    expect(await within(panel).findByText('Pendiente de aprobación')).toBeVisible();
    await user.click(within(panel).getByRole('button', { name: /aprobar tarjeta/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /aprobar tarjeta/i }));
    expect(await within(dialog).findByText(/escribe el motivo/i)).toBeVisible();
    expect(apiMock.decidePlatformCardApproval).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/motivo/i), '  Alta del lunes  ');
    await user.click(within(dialog).getByRole('button', { name: /aprobar tarjeta/i }));

    await waitFor(() => expect(apiMock.decidePlatformCardApproval).toHaveBeenCalledTimes(1));
    const [token, id, decision, motivo, key] = apiMock.decidePlatformCardApproval.mock.calls[0] as string[];
    expect([token, id, decision, motivo]).toEqual(['platform-token', cafeteria.id, 'aprobar', 'Alta del lunes']);
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await within(panel).findByText('Aprobada')).toBeVisible();
    expect(within(panel).getByText('Historial (1)')).toBeInTheDocument();
    expect(await screen.findByText(/tarjeta aprobada/i)).toBeVisible();
  });

  it('cancelar la revocación no llama al back', async () => {
    apiMock.platformCardApproval.mockResolvedValue(consulta(aprobada));
    const user = userEvent.setup();
    renderPage(cafeteria);

    const panel = await screen.findByRole('region', { name: 'Aprobación de tarjeta' });
    await user.click(await within(panel).findByRole('button', { name: /revocar aprobación/i }));
    const dialog = await screen.findByRole('dialog', { name: /revocar la aprobación de tarjeta/i });
    expect(within(dialog).getByText(/los pagos ya iniciados no se cancelan/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Volver' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiMock.decidePlatformCardApproval).not.toHaveBeenCalled();
  });

  it('revoca tras confirmar, vuelve a consultar y deja visible el estado revocado', async () => {
    apiMock.platformCardApproval.mockResolvedValueOnce(consulta(aprobada)).mockResolvedValue(consulta(revocada));
    apiMock.decidePlatformCardApproval.mockResolvedValue({ establecimiento_id: cafeteria.id, cambio: true, aprobacion: revocada, stripe: null });
    const user = userEvent.setup();
    renderPage(cafeteria);

    const panel = await screen.findByRole('region', { name: 'Aprobación de tarjeta' });
    await user.click(await within(panel).findByRole('button', { name: /revocar aprobación/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Contracargos');
    await user.click(within(dialog).getByRole('button', { name: /revocar aprobación/i }));

    await waitFor(() =>
      expect(apiMock.decidePlatformCardApproval).toHaveBeenCalledWith('platform-token', cafeteria.id, 'revocar', 'Contracargos', expect.any(String)),
    );
    expect(await within(panel).findByText('Revocada')).toBeVisible();
    expect(apiMock.platformCardApproval).toHaveBeenCalledTimes(2);
    // El listado también se vuelve a pedir: revocar apaga stripe_enabled.
    await waitFor(() => expect(apiMock.listEstablishments.mock.calls.length).toBeGreaterThan(1));
  });

  it('un 409 se explica por código, conserva el estado y el reintento repite la llave', async () => {
    apiMock.platformCardApproval.mockResolvedValue(consulta(sinAprobar));
    apiMock.decidePlatformCardApproval.mockRejectedValue(
      new VaiinillaApiError(409, { code: 'STRIPE_APPROVAL_CAFETERIA_ONLY', message: 'x' }),
    );
    const user = userEvent.setup();
    renderPage(cafeteria);

    const panel = await screen.findByRole('region', { name: 'Aprobación de tarjeta' });
    await user.click(await within(panel).findByRole('button', { name: /aprobar tarjeta/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Alta');
    await user.click(within(dialog).getByRole('button', { name: /aprobar tarjeta/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/solo están disponibles en cafeterías/i);
    await user.click(within(dialog).getByRole('button', { name: /aprobar tarjeta/i }));
    await waitFor(() => expect(apiMock.decidePlatformCardApproval).toHaveBeenCalledTimes(2));
    const keys = apiMock.decidePlatformCardApproval.mock.calls.map((call) => call[4] as string);
    expect(keys[0]).toBe(keys[1]);
    expect(within(panel).getByText('Pendiente de aprobación')).toBeVisible();
  });

  it('un 403 al consultar se muestra sin romper la ficha', async () => {
    apiMock.platformCardApproval.mockRejectedValue(new VaiinillaApiError(403, { code: 'MFA_REQUIRED', message: 'x' }));
    renderPage(cafeteria);

    const panel = await screen.findByRole('region', { name: 'Aprobación de tarjeta' });
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/segundo factor/i);
    expect(screen.getByRole('button', { name: /configurar/i })).toBeVisible();
  });
});
