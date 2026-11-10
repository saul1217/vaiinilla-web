import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletClient, WalletClientDetail } from '../types/api';
import { WalletCajaPage } from './wallet-caja-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const session = vi.hoisted(() => ({ rol: 'cajero' }));

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: session.rol, establecimiento_id: 'store-1', membresia_id: 'm-1', usuario_id: 'cajero-1' } } }),
}));

const CLIENT_ID = '0b5f8a52-6f0e-4b8a-9d55-2c1f4e7a9b10';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const client = (patch: Partial<WalletClient> = {}): WalletClient => ({
  usuario_id: CLIENT_ID, nombre: 'Ana Pérez', identificador_cliente: 'A-12', correo_enmascarado: 'a***@ejemplo.com',
  ultimo_pedido_en: null, saldo: '50.00', ...patch,
});

const detail = (patch: Partial<WalletClientDetail['wallet']> = {}, movimientos: WalletClientDetail['movimientos'] = [{
  id: 'mov-1', tipo: 'compra', descripcion: 'Compra con saldo', monto: '-25.00', saldo_posterior: '50.00',
  pedido_id: 'p-1', pedido_folio: 128, lugar: 'Mesa 4', resumen_productos: 'Café', creado_en: '2026-11-09T15:00:00Z',
}]): WalletClientDetail => ({
  cliente: { usuario_id: CLIENT_ID, nombre: 'Ana Pérez', identificador_cliente: 'A-12' },
  wallet: { id: 'w-1', usuario_id: CLIENT_ID, establecimiento_id: 'store-1', saldo: '50.00', actualizado_en: null, saldo_congelado: false, ...patch },
  movimientos,
});

const ok = <T,>(data: T, meta: Record<string, unknown> = {}) => HttpResponse.json({ data, meta, error: null });
const fail = (status: number, code: string) => HttpResponse.json({ data: null, meta: {}, error: { code, message: code } }, { status });

function handlers({ open = true, wallet = detail() }: { open?: boolean; wallet?: WalletClientDetail } = {}) {
  return [
    http.get(`${baseUrl}/wallets/clientes`, ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
      expect(new URL(request.url).searchParams.get('q')).toBe('ana');
      return ok([client()]);
    }),
    http.get(`${baseUrl}/wallets/${CLIENT_ID}`, () => ok(wallet, { cursor: null })),
    http.get(`${baseUrl}/sesiones-caja/activa`, () => ok(open ? { id: 's-1', estado: 'abierta' } : null)),
  ];
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={queryClient}><WalletCajaPage /></QueryClientProvider></MemoryRouter>);
}

async function openClient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('searchbox', { name: 'Nombre o identificador' }), 'ana');
  const results = await screen.findByRole('list', { name: 'Clientes encontrados' });
  await user.click(within(results).getByRole('button', { name: /Ana Pérez/ }));
  await screen.findByRole('region', { name: 'Saldo de Ana Pérez' });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { session.rol = 'cajero'; });
afterEach(() => { server.resetHandlers(); window.localStorage.clear(); });
afterAll(() => server.close());

describe('WalletCajaPage', () => {
  it('el cajero busca, ve saldo y movimientos, confirma y recarga en efectivo con llave de idempotencia', async () => {
    const posts: { key: string | null; body: unknown }[] = [];
    server.use(...handlers(), http.post(`${baseUrl}/wallets/${CLIENT_ID}/recargas-efectivo`, async ({ request }) => {
      posts.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      return HttpResponse.json({ data: { usuario_id: CLIENT_ID, saldo_anterior: '50.00', recarga: '100.00', saldo_nuevo: '150.00', movimiento_id: 'mv', sesion_caja_id: 's-1' }, meta: {}, error: null }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);

    expect(screen.getAllByText('$50.00 MXN').length).toBeGreaterThan(0);
    const movements = screen.getByRole('list', { name: 'Movimientos de Ana Pérez' });
    expect(within(movements).getByText('Compra con saldo')).toBeInTheDocument();
    expect(within(movements).getByText('−$25.00 MXN')).toBeInTheDocument();
    expect(within(movements).getByText('Pedido #128 · Mesa 4 · Café')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '$100' }));
    await user.click(screen.getByRole('button', { name: 'Recargar $100.00 MXN en efectivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar recarga' });
    expect(within(dialog).getByText('¿Recibiste $100.00 MXN en efectivo de Ana Pérez?')).toBeInTheDocument();
    expect(within(dialog).getByText('$150.00 MXN')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Sí, recargar $100.00 MXN' }));

    expect(await screen.findByText(/Recarga de \$100.00 MXN para Ana Pérez/)).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toMatch(UUID);
    expect(posts[0]!.body).toEqual({ monto: '100.00' });
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith('vaiinilla:wallet-recharge'))).toHaveLength(0);
  });

  it('si no hay respuesta deja la recarga pendiente y el reintento usa la misma llave', async () => {
    const keys: (string | null)[] = [];
    server.use(...handlers(), http.post(`${baseUrl}/wallets/${CLIENT_ID}/recargas-efectivo`, ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key'));
      if (keys.length === 1) return HttpResponse.error();
      return HttpResponse.json({ data: { usuario_id: CLIENT_ID, saldo_anterior: '50.00', recarga: '75.50', saldo_nuevo: '125.50', movimiento_id: 'mv', sesion_caja_id: 's-1' }, meta: {}, error: null }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);

    await user.type(screen.getByRole('textbox', { name: 'Monto' }), '75.5');
    await user.click(screen.getByRole('button', { name: 'Recargar $75.50 MXN en efectivo' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Sí, recargar/ }));

    expect(await screen.findByText('Recarga sin confirmar: $75.50 MXN para Ana Pérez.')).toBeInTheDocument();
    expect(screen.getByText(/No hubo respuesta del servidor/)).toBeInTheDocument();
    // Mientras haya una en duda no se puede empezar otra.
    await user.type(screen.getByRole('textbox', { name: 'Monto' }), '20');
    expect(screen.getByRole('button', { name: 'Recargar $20.00 MXN en efectivo' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reintentar recarga' }));
    expect(await screen.findByText(/Recarga de \$75.50 MXN para Ana Pérez/)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(screen.queryByText(/Recarga sin confirmar/)).not.toBeInTheDocument();
  });

  it('la recarga pendiente sobrevive a recargar la página', async () => {
    window.localStorage.setItem(
      `vaiinilla:wallet-recharge:v1:${encodeURIComponent(baseUrl)}|store-1|cajero-1`,
      JSON.stringify({ version: 1, userId: CLIENT_ID, userName: 'Ana Pérez', amount: '200.00', idempotencyKey: '11111111-2222-4333-8444-555555555555', createdAt: Date.now() }),
    );
    let key: string | null = null;
    server.use(...handlers(), http.post(`${baseUrl}/wallets/${CLIENT_ID}/recargas-efectivo`, ({ request }) => {
      key = request.headers.get('Idempotency-Key');
      return HttpResponse.json({ data: { usuario_id: CLIENT_ID, saldo_anterior: '50.00', recarga: '200.00', saldo_nuevo: '250.00', movimiento_id: 'mv', sesion_caja_id: 's-1' }, meta: {}, error: null }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reintentar recarga' }));
    expect(await screen.findByText(/Recarga de \$200.00 MXN para Ana Pérez/)).toBeInTheDocument();
    expect(key).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('si el servidor rechaza por Caja cerrada lo dice y no deja la recarga pendiente', async () => {
    server.use(...handlers(), http.post(`${baseUrl}/wallets/${CLIENT_ID}/recargas-efectivo`, () => fail(422, 'CASH_REGISTER_CLOSED')));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);
    await user.click(screen.getByRole('button', { name: '$50' }));
    await user.click(screen.getByRole('button', { name: 'Recargar $50.00 MXN en efectivo' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Sí, recargar/ }));
    expect(await screen.findByText('No hay una sesión de Caja abierta. Abre Caja antes de recargar.')).toBeInTheDocument();
    expect(screen.queryByText(/Recarga sin confirmar/)).not.toBeInTheDocument();
  });

  it('con Caja cerrada avisa y no deja recargar', async () => {
    server.use(...handlers({ open: false }));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);
    expect(await screen.findByText(/Caja está cerrada. Ábrela desde Caja/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '$100' }));
    expect(screen.getByRole('button', { name: 'Recargar $100.00 MXN en efectivo' })).toBeDisabled();
  });

  it('con el saldo congelado no ofrece recargar', async () => {
    server.use(...handlers({ wallet: detail({ saldo_congelado: true }) }));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);
    expect(screen.getByText(/tiene apagado «Pagar con saldo»/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recargar/ })).not.toBeInTheDocument();
  });

  it('el admin ve saldo y movimientos pero no puede recargar ni consulta Caja', async () => {
    session.rol = 'admin';
    server.use(...handlers().filter((_, index) => index !== 2));
    const user = userEvent.setup();
    renderPage();
    await openClient(user);
    expect(screen.getByRole('list', { name: 'Movimientos de Ana Pérez' })).toBeInTheDocument();
    expect(screen.getByText('Solo Caja puede recargar saldo. Desde aquí lo consultas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recargar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Monto' })).not.toBeInTheDocument();
  });

  it('pagina los movimientos con el cursor del servidor', async () => {
    const second = { ...detail().movimientos[0]!, id: 'mov-2', tipo: 'recarga_efectivo', descripcion: 'Recarga en efectivo', monto: '75.00', pedido_id: null, pedido_folio: null, lugar: null, resumen_productos: null };
    // El primero que coincide gana: este va antes que el detalle sin cursor de handlers().
    server.use(http.get(`${baseUrl}/wallets/${CLIENT_ID}`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      return cursor === 'c-2' ? ok(detail({}, [second]), { cursor: null }) : ok(detail(), { cursor: 'c-2' });
    }), ...handlers());
    const user = userEvent.setup();
    renderPage();
    await openClient(user);
    await user.click(screen.getByRole('button', { name: 'Ver más movimientos' }));
    expect(await screen.findByText('Recarga en efectivo')).toBeInTheDocument();
    expect(screen.getByText('+$75.00 MXN')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ver más movimientos' })).not.toBeInTheDocument());
  });

  it('sin resultados lo dice', async () => {
    server.use(http.get(`${baseUrl}/wallets/clientes`, () => ok([])), http.get(`${baseUrl}/sesiones-caja/activa`, () => ok(null)));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Nombre o identificador' }), 'zz');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });
});
