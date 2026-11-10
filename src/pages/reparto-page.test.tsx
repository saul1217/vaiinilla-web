import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { agendaRange } from '../lib/reparto';
import type { HomeAgendaDay, HomeOrder } from '../types/api';
import { RepartoPage } from './reparto-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const session = vi.hoisted(() => ({ rol: 'cajero' }));

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: session.rol, establecimiento_id: 'store-1', membresia_id: 'm-1', usuario_id: 'u-1' } } }),
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { today } = agendaRange();

const order = (patch: Partial<HomeOrder> = {}): HomeOrder => ({
  id: 'p-1', folio: 12, fecha_operativa: today, estado: 'cobrado', metodo_pago: 'efectivo', destino: 'a_domicilio',
  espacio: null, subtotal: '300.00', ahorro_combinado: '0.00', cashback_otorgado: '0.00', total: '340.00', version: 3,
  creado_en: '2026-11-10T15:00:00Z', actualizado_en: '2026-11-10T15:00:00Z', notas_cocina: null,
  usuario: { nombre: 'Ana Pérez', matricula: null },
  items: [{ id: 1, producto_id: 9, nombre_producto: 'Pastel de chocolate', estacion_preparacion: 'cocina', cantidad: 1, precio_digital_unitario: '300.00', subtotal: '300.00', opciones: [] }],
  fecha_entrega: today, franja_entrega: '10:00-12:00',
  entrega: { direccion: 'Calle 5 #123', referencia: 'Portón verde', telefono: '6141234567', lat: null, lng: null },
  costo_envio: '40.00', anticipo: null, por_cobrar_al_entregar: '0.00', cobrado_al_entregar: null,
  ...patch,
});

const ok = <T,>(data: T, status = 200) => HttpResponse.json({ data, meta: {}, error: null }, { status });
const fail = (status: number, code: string, details?: unknown) =>
  HttpResponse.json({ data: null, meta: {}, error: { code, message: code, details } }, { status });

function agendaHandler(days: () => HomeAgendaDay[]) {
  return http.get(`${baseUrl}/establecimiento/agenda`, ({ request }) => {
    expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
    const url = new URL(request.url);
    const range = agendaRange();
    expect(url.searchParams.get('desde')).toBe(range.from);
    expect(url.searchParams.get('hasta')).toBe(range.to);
    return ok(days());
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={queryClient}><RepartoPage /></QueryClientProvider></MemoryRouter>);
}

async function openOrder(user: ReturnType<typeof userEvent.setup>, list: string, name: RegExp) {
  const region = await screen.findByRole('list', { name: list });
  await user.click(within(region).getByRole('button', { name }));
  return screen.findByRole('dialog');
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { session.rol = 'cajero'; });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('RepartoPage', () => {
  it('muestra «Por aceptar», «Me deben» con su total y la agenda del día', async () => {
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [
      order({ id: 'a1', folio: 20, estado: 'por_aceptar' }),
      order({ id: 'd1', folio: 21, estado: 'entregado', por_cobrar_al_entregar: '150.00' }),
    ] }]));
    renderPage();

    const awaiting = await screen.findByRole('list', { name: 'Por aceptar' });
    expect(within(awaiting).getByRole('button', { name: /#20 · Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Total que te deben')).toHaveTextContent('$150.00 MXN');
    expect(within(screen.getByRole('list', { name: 'Me deben' })).getByRole('button', { name: /#21/ })).toHaveTextContent('Entregado · por cobrar');
    expect(within(screen.getByRole('list', { name: 'Pedidos de Hoy' })).getAllByRole('button')).toHaveLength(2);
  });

  it('sin pedidos dice que no hay entregas pendientes', async () => {
    server.use(agendaHandler(() => []));
    renderPage();
    expect(await screen.findByText('Sin entregas pendientes')).toBeInTheDocument();
  });

  it('si la agenda falla deja reintentar', async () => {
    let calls = 0;
    server.use(http.get(`${baseUrl}/establecimiento/agenda`, () => (++calls === 1 ? fail(500, 'INTERNAL') : ok([]))));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin entregas pendientes')).toBeInTheDocument();
  });

  it('acepta un encargo con llave de idempotencia y cuerpo vacío', async () => {
    let current = order({ estado: 'por_aceptar' });
    const posts: { key: string | null; body: unknown }[] = [];
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [current] }]), http.post(`${baseUrl}/pedidos/p-1/aceptar`, async ({ request }) => {
      posts.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      current = order({ estado: 'cobrado' });
      return ok(current, 201);
    }));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Por aceptar', /#12/);
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar encargo' }));

    expect(await within(dialog).findByText('Encargo aceptado.')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toMatch(UUID);
    expect(posts[0]!.body).toEqual({});
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Salió a entregar/ })).toBeInTheDocument();
  });

  it('rechazar pide un motivo y lo manda recortado', async () => {
    const posts: unknown[] = [];
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'por_aceptar' })] }]), http.post(`${baseUrl}/pedidos/p-1/rechazar`, async ({ request }) => {
      posts.push(await request.json());
      return ok(order({ estado: 'cancelado' }), 201);
    }));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Por aceptar', /#12/);
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    const confirm = within(dialog).getByRole('button', { name: 'Rechazar' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Motivo' }), '  Se acabó la harina ');
    await user.click(confirm);

    await waitFor(() => expect(posts).toEqual([{ motivo: 'Se acabó la harina' }]));
    expect(await screen.findByText('Encargo rechazado; se le devuelve lo que pagó.')).toBeInTheDocument();
  });

  it('entrega con el código del cliente y cobra lo pendiente en la misma acción', async () => {
    let current = order({ estado: 'en_camino', por_cobrar_al_entregar: '340.00' });
    const calls: { path: string; body: unknown }[] = [];
    server.use(
      agendaHandler(() => [{ fecha: today, pedidos: [current] }]),
      http.post(`${baseUrl}/pedidos/p-1/entregar-domicilio`, async ({ request }) => {
        calls.push({ path: 'entregar', body: await request.json() });
        current = order({ estado: 'entregado', por_cobrar_al_entregar: '340.00' });
        return ok(current, 201);
      }),
      http.post(`${baseUrl}/pedidos/p-1/cobrar-entrega`, async ({ request }) => {
        calls.push({ path: 'cobrar', body: await request.json() });
        current = order({ estado: 'entregado', por_cobrar_al_entregar: '0.00', cobrado_al_entregar: { metodo: 'transferencia', en: '2026-11-10T18:00:00Z' } });
        return ok(current, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    const deliver = within(dialog).getByRole('button', { name: 'Entregar y cobrar $340.00 MXN' });
    expect(deliver).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Código del cliente' }), '48a12');
    await user.click(within(dialog).getByRole('button', { name: 'Transferencia' }));
    await user.click(deliver);

    await waitFor(() => expect(calls).toEqual([
      { path: 'entregar', body: { codigo: '4812' } },
      { path: 'cobrar', body: { metodo: 'transferencia' } },
    ]));
    expect(await screen.findByText('Entregado y cobrado.')).toBeInTheDocument();
  });

  it('con el código equivocado dice cuántos intentos quedan', async () => {
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'en_camino' })] }]),
      http.post(`${baseUrl}/pedidos/p-1/entregar-domicilio`, () => fail(422, 'INVALID_DELIVERY_CODE', [{ field: 'codigo', intentos_restantes: 3 }])));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    await user.type(within(dialog).getByRole('textbox', { name: 'Código del cliente' }), '1111');
    await user.click(within(dialog).getByRole('button', { name: 'Entregado' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El código no coincide. Te quedan 3 intentos.');
  });

  it('con el código bloqueado, admin entrega sin código y cajero no ve esa opción', async () => {
    const bodies: unknown[] = [];
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'en_camino' })] }]),
      http.post(`${baseUrl}/pedidos/p-1/entregar-domicilio`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        return (body as { entrega_manual?: boolean }).entrega_manual ? ok(order({ estado: 'entregado' }), 201) : fail(423, 'DELIVERY_CODE_LOCKED');
      }));
    const user = userEvent.setup();

    session.rol = 'cajero';
    const first = renderPage();
    let dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    await user.type(within(dialog).getByRole('textbox', { name: 'Código del cliente' }), '1111');
    await user.click(within(dialog).getByRole('button', { name: 'Entregado' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Un admin debe confirmar la entrega.');
    expect(within(dialog).queryByRole('button', { name: 'Entregar sin código' })).not.toBeInTheDocument();
    first.unmount();

    session.rol = 'admin';
    renderPage();
    dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    await user.type(within(dialog).getByRole('textbox', { name: 'Código del cliente' }), '1111');
    await user.click(within(dialog).getByRole('button', { name: 'Entregado' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Entregar sin código' }));
    await waitFor(() => expect(bodies.at(-1)).toEqual({ entrega_manual: true }));
  });

  it('si se pierde la respuesta al mandar, el reintento usa la misma llave', async () => {
    const keys: (string | null)[] = [];
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'listo' })] }]),
      http.post(`${baseUrl}/pedidos/p-1/en-camino`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return keys.length === 1 ? HttpResponse.error() : ok(order({ estado: 'en_camino' }), 201);
      }));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    await user.click(within(dialog).getByRole('button', { name: /Salió a entregar/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/no se repite/);
    await user.click(within(dialog).getByRole('button', { name: /Salió a entregar/ }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toBe(keys[1]);
  });

  it('cancelar un pedido aceptado manda la versión esperada y el motivo', async () => {
    const bodies: unknown[] = [];
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'listo', version: 7 })] }]),
      http.post(`${baseUrl}/pedidos/p-1/cancelaciones`, async ({ request }) => {
        bodies.push(await request.json());
        return ok({ pedido_id: 'p-1' }, 201);
      }));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Motivo' }), 'Se descompuso el horno');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(bodies).toEqual([{ version_esperada: 7, motivo: 'Se descompuso el horno' }]));
  });

  it('el detalle trae dirección con Mapas, teléfono y lo que falta cobrar', async () => {
    server.use(agendaHandler(() => [{ fecha: today, pedidos: [order({ estado: 'cobrado', por_cobrar_al_entregar: '340.00' })] }]));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openOrder(user, 'Pedidos de Hoy', /#12/);
    expect(within(dialog).getByText('Calle 5 #123')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Abrir en Mapas' })).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
    expect(within(dialog).getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:6141234567');
    expect(within(dialog).getByText('Por cobrar al entregar').nextSibling).toHaveTextContent('$340.00 MXN');
  });
});
