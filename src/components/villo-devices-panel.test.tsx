import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/auth-context';
import type { SessionAccess, VilloDevice } from '../types/api';
import { VilloDevicesPanel } from './villo-devices-panel';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const SECRET = 'villo_TokenDePruebaQueSoloSeVeUnaVez0123456789abcdef';

const fakeUser = { uid: 'u1', getIdToken: vi.fn().mockResolvedValue('firebase-token') };
vi.mock('../context/auth-context', () => ({ useAuth: vi.fn() }));

function access(overrides: Partial<SessionAccess> = {}): SessionAccess {
  return {
    membresia_id: 'm-admin',
    establecimiento: { id: 'e1', nombre: 'USAGI', slug: 'usagi' },
    rol: 'admin',
    identificador_cliente: null,
    estado_establecimiento: 'activo',
    cierre_operativo_disponible: false,
    ...overrides,
  };
}

function device(overrides: Partial<VilloDevice> = {}): VilloDevice {
  return {
    id: 'd1',
    nombre: 'Villo 1',
    estado: 'activo',
    espacio: { id: 1, nombre: 'Mesa 1' },
    token: { emitido: true, vigente: true, emitido_en: '2026-11-09T12:00:00Z', expira_en: '2026-12-09T12:00:00Z' },
    ultimo_uso_en: '2026-11-09T18:00:00Z',
    ultima_alerta_en: null,
    revocado_en: null,
    motivo_revocacion: null,
    creado_en: '2026-11-09T11:00:00Z',
    version: 3,
    ...overrides,
  };
}

const envelope = (data: unknown, status = 200) => HttpResponse.json({ data, meta: {}, error: null }, { status });
const failure = (status: number, code: string) =>
  HttpResponse.json({ data: null, meta: {}, error: { code, message: code } }, { status });

function space(id: number, nombre: string) {
  return { id, nombre, tipo: 'mesa', activo: true, qr_url: 'https://x', precio_hora: null };
}

function baseHandlers(devices: VilloDevice[], accesses: SessionAccess[] = [access()]) {
  return [
    http.get(`${baseUrl}/sesiones/accesos`, () => envelope(accesses)),
    http.post(`${baseUrl}/sesiones/contexto`, async ({ request }) => {
      expect(await request.json()).toEqual({ membresia_id: 'm-admin' });
      return envelope({ access_token: 'tenant-jwt', token_type: 'Bearer', expires_in: 900, contexto: {} });
    }),
    http.get(`${baseUrl}/villo/dispositivos`, ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer tenant-jwt');
      return envelope(devices);
    }),
    http.get(`${baseUrl}/espacios/administracion`, () => envelope([space(1, 'Mesa 1'), space(2, 'Mesa 2')])),
  ];
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: fakeUser } as unknown as ReturnType<typeof useAuth>);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Panel de dispositivos VILLO', () => {
  it('lista con mesa, estado, token y última conexión, y muestra el server_url del entorno', async () => {
    server.use(...baseHandlers([device(), device({ id: 'd2', nombre: 'Viejo', estado: 'revocado', espacio: null, revocado_en: '2026-11-08T10:00:00Z' })]));
    render(<VilloDevicesPanel />, { wrapper: Wrapper });

    const item = await screen.findByRole('listitem', { name: 'Villo 1' });
    expect(within(item).getByText(/Mesa: Mesa 1/)).toBeInTheDocument();
    expect(within(item).getByText('Token vigente')).toBeInTheDocument();
    expect(within(item).getByText('Última conexión:')).toBeInTheDocument();
    expect(screen.getAllByText(baseUrl).length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'revocado');
    expect(screen.queryByRole('listitem', { name: 'Villo 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Viejo' })).toBeInTheDocument();
  });

  it('sin accesos de admin no pide nada al backend de VILLO', async () => {
    server.use(http.get(`${baseUrl}/sesiones/accesos`, () => envelope([access({ rol: 'mesero' })])));
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    expect(await screen.findByText('No administras ningún negocio')).toBeInTheDocument();
  });

  it('el token se muestra una sola vez, se puede copiar y no queda en el navegador', async () => {
    const log = vi.spyOn(console, 'log');
    server.use(
      ...baseHandlers([device()]),
      http.post(`${baseUrl}/villo/dispositivos/d1/token`, () =>
        envelope({ token: SECRET, expira_en: '2026-12-09T12:00:00Z', dispositivo: device({ version: 4 }) }, 201)),
    );
    const user = userEvent.setup();
    // userEvent.setup() pone su propio portapapeles: se espía después.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<VilloDevicesPanel />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: /Generar token nuevo/ }));
    expect(screen.getByText(/deja sin servicio al anterior/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sí, generar token nuevo' }));

    expect(await screen.findByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText(/no se vuelve a mostrar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Copiar token/ }));
    expect(writeText).toHaveBeenCalledWith(SECRET);

    await user.click(screen.getByRole('button', { name: 'Ya lo copié' }));
    await waitFor(() => expect(screen.queryByText(SECRET)).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify({ ...localStorage })).not.toContain(SECRET);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SECRET);
    expect(log.mock.calls.flat().join(' ')).not.toContain(SECRET);
    log.mockRestore();
  });

  it('al reasignar avisa que se borra el token y ofrece generar uno nuevo', async () => {
    let body: unknown;
    server.use(
      ...baseHandlers([device()]),
      http.patch(`${baseUrl}/villo/dispositivos/d1`, async ({ request }) => {
        body = await request.json();
        return envelope(device({ espacio: { id: 2, nombre: 'Mesa 2' }, token: { emitido: false, vigente: false, emitido_en: null, expira_en: null }, version: 4 }));
      }),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: 'Editar nombre o mesa' }));
    await user.selectOptions(screen.getByLabelText('Mesa'), '2');
    expect(screen.getByText(/se borra el token actual/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/cambió de mesa/)).toBeInTheDocument();
    expect(body).toEqual({ espacio_id: 2, version_esperada: 3 });
    expect(screen.getByRole('button', { name: 'Generar token' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Después' })).toBeInTheDocument();
  });

  it.each([
    ['SPACE_HAS_DEVICE', 409, /Esa mesa ya tiene un VILLO activo/],
    ['DEVICE_VERSION_CONFLICT', 409, /Alguien más cambió este VILLO/],
    ['SPACE_NOT_FOUND', 404, /Esa mesa no existe o está inactiva/],
    ['DEVICE_REVOKED', 409, /ya está dado de baja/],
  ])('al editar, %s muestra un mensaje claro', async (code, status, text) => {
    server.use(
      ...baseHandlers([device()]),
      http.patch(`${baseUrl}/villo/dispositivos/d1`, () => failure(status, code)),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Editar nombre o mesa' }));
    await user.selectOptions(screen.getByLabelText('Mesa'), '2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    ['VILLO_DISABLED', 403, /no tiene VILLO activado/],
    ['FORBIDDEN_ROLE', 403, /Solo la administración/],
    ['DEVICE_WITHOUT_SPACE', 409, /Asígnale una mesa/],
  ])('al generar token, %s muestra un mensaje claro', async (code, status, text) => {
    server.use(
      ...baseHandlers([device({ token: { emitido: false, vigente: false, emitido_en: null, expira_en: null } })]),
      http.post(`${baseUrl}/villo/dispositivos/d1/token`, () => failure(status, code)),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Generar token' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generar token' }));
    expect(await within(screen.getByRole('dialog')).findByText(text)).toBeInTheDocument();
  });

  it('registra un VILLO con nombre y mesa', async () => {
    let body: unknown;
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/villo/dispositivos`, async ({ request }) => {
        body = await request.json();
        return envelope(device({ id: 'd9', nombre: 'Terraza', token: { emitido: false, vigente: false, emitido_en: null, expira_en: null } }), 201);
      }),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    expect(await screen.findByText('Todavía no hay VILLO')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar VILLO/ }));
    await user.type(screen.getByLabelText('Nombre'), 'Terraza');
    await user.selectOptions(screen.getByLabelText('Mesa'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText(/Registramos «Terraza»/)).toBeInTheDocument();
    expect(body).toEqual({ nombre: 'Terraza', espacio_id: 1 });
  });

  it('dar de baja pide confirmación explícita y manda el motivo', async () => {
    let body: unknown;
    server.use(
      ...baseHandlers([device()]),
      http.post(`${baseUrl}/villo/dispositivos/d1/revocar`, async ({ request }) => {
        body = await request.json();
        return envelope(device({ estado: 'revocado' }));
      }),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Dar de baja' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motivo (opcional)'), 'Se perdió');
    await user.click(within(dialog).getByLabelText(/no se puede deshacer/));
    await user.click(confirm);
    expect(await screen.findByText(/quedó dado de baja/)).toBeInTheDocument();
    expect(body).toEqual({ motivo: 'Se perdió' });
  });

  it('muestra las alertas del dispositivo', async () => {
    server.use(
      ...baseHandlers([device()]),
      http.get(`${baseUrl}/villo/dispositivos/d1/alertas`, () =>
        envelope([{ id: 'a1', tipo: 'ip_nueva', creado_en: '2026-11-09T18:00:00Z' }])),
    );
    const user = userEvent.setup();
    render(<VilloDevicesPanel />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: /Ver alertas/ }));
    expect(await screen.findByText(/IP nueva/)).toBeInTheDocument();
  });
});
