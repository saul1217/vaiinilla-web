import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourtAvailabilityDay, ManagedSpace, SpaceAvailability, StaffBooking } from '../types/api';
import { BowlingAdminPage } from './bowling-admin-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const session = vi.hoisted(() => ({ rol: 'cajero' }));

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: session.rol, establecimiento_id: 'store-1', membresia_id: 'm-1', usuario_id: 'u-1' } } }),
}));

const RENTAL_ID = ['5d1c2b3a', '1f2e', '4c3d', '8b7a', '0f1e2d3c4b5a'].join('-');
const LATER = new Date(Date.now() + 3 * 3600_000).toISOString();
const END = new Date(Date.now() + 3600_000).toISOString();

const availability = (patch: Partial<CourtAvailabilityDay> = {}): CourtAvailabilityDay => ({
  fecha: '2026-11-10', hoy: '2026-11-10', zona_horaria: 'America/Mexico_City', apertura: '12:00', cierre: '23:00',
  abre: '2026-11-10T18:00:00Z', cierra: '2026-11-11T05:00:00Z', bloque_min: 30, duraciones_min: [60, 120, 180], dias_adelanto: 7,
  tipo_establecimiento: 'boliche', cerrado: false, ahora: new Date().toISOString(),
  canchas: [
    { espacio: { id: 1, nombre: 'Pista 1', tipo: 'cancha' }, precio_hora: '300.00', rentable: true, capacidad: 6, duraciones_min: [60, 120], ocupado: [] },
    { espacio: { id: 2, nombre: 'Pista 2', tipo: 'cancha' }, precio_hora: '300.00', rentable: true, capacidad: null, duraciones_min: [60, 120],
      ocupado: [{ inicio: new Date(Date.now() - 1800_000).toISOString(), fin: END, motivo: 'turno' }] },
  ],
  ...patch,
});

const board: SpaceAvailability[] = [
  { espacio: { id: 1, nombre: 'Pista 1', tipo: 'cancha' }, estado: 'libre', saldada: true, inicio: null, fin_previsto: null, precio_hora: '300.00', proxima_reserva: null },
  { espacio: { id: 2, nombre: 'Pista 2', tipo: 'cancha' }, estado: 'ocupada', saldada: true, inicio: null, fin_previsto: END, precio_hora: '300.00', proxima_reserva: null },
] as SpaceAvailability[];

const rental = (patch: Record<string, unknown> = {}) => ({
  id: RENTAL_ID, espacio: { id: 1, nombre: 'Pista 1', tipo: 'cancha' }, inicio: new Date().toISOString(), fin: END,
  duracion_min: 60, monto: '300.00', estado: 'pendiente_pago', version: 1, jugadores: 4, ...patch,
});

const ok = <T,>(data: T, status = 200) => HttpResponse.json({ data, meta: {}, error: null }, { status });
const fail = (status: number, code: string, message = code) => HttpResponse.json({ data: null, meta: {}, error: { code, message } }, { status });

function baseHandlers({ avail = availability(), bookings = [] as StaffBooking[] } = {}) {
  return [
    http.get(`${baseUrl}/reservas/disponibilidad`, ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
      return ok(avail);
    }),
    http.get(`${baseUrl}/espacios/disponibilidad`, () => ok(board)),
    http.get(`${baseUrl}/reservas`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('fecha')).toBe('2026-11-10');
      return ok(bookings);
    }),
  ];
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={queryClient}><BowlingAdminPage /></QueryClientProvider></MemoryRouter>);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { session.rol = 'cajero'; });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('BowlingAdminPage', () => {
  it('en un negocio que no es boliche no muestra pistas', async () => {
    server.use(...baseHandlers({ avail: availability({ tipo_establecimiento: 'padel' }) }));
    renderPage();
    expect(await screen.findByText('Este negocio no es un boliche')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pistas' })).not.toBeInTheDocument();
  });

  it('Caja renta una pista libre con jugadores y la cobra en efectivo con cambio', async () => {
    const posts: unknown[] = [];
    const payments: { key: string | null; body: unknown }[] = [];
    server.use(
      ...baseHandlers(),
      http.post(`${baseUrl}/reservas`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        posts.push(await request.json());
        return ok(rental(), 201);
      }),
      http.post(`${baseUrl}/reservas/${RENTAL_ID}/pago`, async ({ request }) => {
        payments.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        return ok({ reserva: rental({ estado: 'confirmada' }), cobro: { monto_recibido: '500.00', cambio: '200.00' } }, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const lanes = await screen.findByRole('list', { name: 'Pistas' });
    expect(screen.queryByRole('button', { name: 'Configurar pistas' })).not.toBeInTheDocument();
    const lane1 = within(lanes).getByRole('article', { name: 'Pista 1' });
    expect(within(lane1).getByText('Libre')).toBeInTheDocument();
    expect(within(lane1).getByText(/Caben 6 jugadores/)).toBeInTheDocument();
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));

    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    // Sin jugadores no se aparta: en un boliche el servidor los exige.
    expect(within(dialog).getByRole('button', { name: 'Anota cuántos juegan' })).toBeDisabled();
    for (let i = 0; i < 7; i += 1) await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    expect(within(dialog).getByText('6 jugadores')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Agregar un jugador' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Quitar un jugador' }));
    await user.click(within(dialog).getByRole('button', { name: '2 h' }));
    await user.type(within(dialog).getByLabelText('A nombre de (opcional)'), 'Ana');
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $600.00 MXN' }));

    await waitFor(() => expect(posts).toEqual([{ espacio_id: 1, duracion_min: 120, jugadores: 5, nombre_cliente: 'Ana' }]));
    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    const pay = within(charge).getByRole('button', { name: 'Cobrar $300.00 MXN en efectivo' });
    expect(pay).toBeDisabled();
    await user.type(within(charge).getByLabelText('Efectivo recibido'), '500');
    expect(within(charge).getByText('Cambio: $200.00 MXN')).toBeInTheDocument();
    await user.click(pay);

    await waitFor(() => expect(payments).toHaveLength(1));
    expect(payments[0]?.body).toEqual({ metodo_pago: 'efectivo', monto_recibido: '500.00' });
    expect(payments[0]?.key).toBeTruthy();
    expect(await screen.findByText(/Pista rentada hasta .* Cambio: \$200.00 MXN\./)).toBeInTheDocument();
  });

  it('cerrar el cobro sin cobrar suelta el horario apartado', async () => {
    const cancels: string[] = [];
    server.use(
      ...baseHandlers(),
      http.post(`${baseUrl}/reservas`, () => ok(rental(), 201)),
      http.post(`${baseUrl}/reservas/${RENTAL_ID}/cancelacion`, () => { cancels.push(RENTAL_ID); return ok({ id: RENTAL_ID, estado: 'cancelada' }); }),
    );
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    await user.click(within(charge).getByRole('button', { name: 'No cobrar y soltar la pista' }));
    await waitFor(() => expect(cancels).toEqual([RENTAL_ID]));
  });

  it('alargar el turno empieza al fin previsto y hereda los jugadores', async () => {
    const posts: unknown[] = [];
    server.use(...baseHandlers(), http.post(`${baseUrl}/reservas`, async ({ request }) => {
      posts.push(await request.json());
      return ok(rental({ espacio: { id: 2, nombre: 'Pista 2', tipo: 'cancha' } }), 201);
    }));
    const user = userEvent.setup();
    renderPage();
    const lane2 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 2' });
    expect(within(lane2).getByText(/En turno hasta/)).toBeInTheDocument();
    expect(within(lane2).queryByRole('button', { name: 'Rentar ahora' })).not.toBeInTheDocument();
    await user.click(await within(lane2).findByRole('button', { name: 'Alargar turno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Alargar turno de Pista 2' });
    expect(within(dialog).getByText('Los del turno')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Alargar · $300.00 MXN' }));
    await waitFor(() => expect(posts).toEqual([{ espacio_id: 2, duracion_min: 60, inicio: END }]));
  });

  it('muestra el error de capacidad que manda el servidor', async () => {
    server.use(...baseHandlers(), http.post(`${baseUrl}/reservas`, () => fail(422, 'PLAYERS_OVER_CAPACITY', 'En Pista 1 caben hasta 6 jugadores.')));
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
    expect(await within(dialog).findByText('En Pista 1 caben hasta 6 jugadores.')).toBeInTheDocument();
  });

  it('en Turnos de hoy cobra un turno por pagar y muestra jugadores', async () => {
    const payments: unknown[] = [];
    const bookings: StaffBooking[] = [
      { id: RENTAL_ID, espacio: { id: 1, nombre: 'Pista 1' }, inicio: LATER, fin: LATER, monto: '300.00', estado: 'pendiente_pago', nombre_cliente: 'Luis', jugadores: 3 },
      { id: 'old', espacio: { id: 2, nombre: 'Pista 2' }, inicio: LATER, fin: LATER, monto: '300.00', estado: 'cancelada' },
    ];
    server.use(...baseHandlers({ bookings }), http.post(`${baseUrl}/reservas/${RENTAL_ID}/pago`, async ({ request }) => {
      payments.push(await request.json());
      return ok({ reserva: rental({ estado: 'confirmada' }), cobro: { monto_recibido: '300.00', cambio: '0.00' } }, 201);
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('list', { name: 'Pistas' });
    await user.click(screen.getByRole('button', { name: 'Turnos de hoy' }));
    const list = await screen.findByRole('list', { name: 'Turnos de hoy' });
    expect(within(list).getAllByRole('article')).toHaveLength(1);
    expect(within(list).getByText(/Por cobrar · \$300.00 MXN · Luis · 3 jugadores/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Cobrar en efectivo' }));
    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    await user.type(within(charge).getByLabelText('Efectivo recibido'), '300');
    await user.click(within(charge).getByRole('button', { name: 'Cobrar $300.00 MXN en efectivo' }));
    await waitFor(() => expect(payments).toEqual([{ metodo_pago: 'efectivo', monto_recibido: '300.00' }]));
  });

  it('reintentar apartar y cobrar manda la misma Idempotency-Key del modal', async () => {
    const reserveKeys: (string | null)[] = [];
    const payKeys: (string | null)[] = [];
    server.use(
      ...baseHandlers(),
      http.post(`${baseUrl}/reservas`, ({ request }) => {
        reserveKeys.push(request.headers.get('Idempotency-Key'));
        // La primera respuesta se pierde (502): el reintento debe ser la misma operación.
        return reserveKeys.length === 1 ? fail(502, 'HTTP_ERROR', 'Sin respuesta') : ok(rental(), 201);
      }),
      http.post(`${baseUrl}/reservas/${RENTAL_ID}/pago`, ({ request }) => {
        payKeys.push(request.headers.get('Idempotency-Key'));
        return payKeys.length === 1
          ? fail(503, 'HTTP_ERROR', 'Sin respuesta')
          : ok({ reserva: rental({ estado: 'confirmada' }), cobro: { monto_recibido: '300.00', cambio: '0.00' } }, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    const reserve = within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' });
    await user.click(reserve);
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await user.click(reserve);

    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    expect(reserveKeys).toHaveLength(2);
    expect(reserveKeys[0]).toBeTruthy();
    expect(reserveKeys[1]).toBe(reserveKeys[0]);

    await user.type(within(charge).getByLabelText('Efectivo recibido'), '300');
    const pay = within(charge).getByRole('button', { name: 'Cobrar $300.00 MXN en efectivo' });
    await user.click(pay);
    expect(await within(charge).findByRole('alert')).toBeInTheDocument();
    await user.click(pay);
    expect(await screen.findByText(/Pista rentada hasta/)).toBeInTheDocument();
    expect(payKeys).toHaveLength(2);
    expect(payKeys[0]).toBeTruthy();
    expect(payKeys[1]).toBe(payKeys[0]);
    // Cobrar es otra operación: no reutiliza la llave de apartar.
    expect(payKeys[0]).not.toBe(reserveKeys[0]);
  });

  it('abrir otra vez el modal de renta usa una llave nueva', async () => {
    const reserveKeys: (string | null)[] = [];
    server.use(...baseHandlers(), http.post(`${baseUrl}/reservas`, ({ request }) => {
      reserveKeys.push(request.headers.get('Idempotency-Key'));
      return fail(409, 'SLOT_TAKEN');
    }));
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    for (let round = 0; round < 2; round += 1) {
      await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
      const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
      await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
      await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
      expect(await within(dialog).findByText(/La pista ya está ocupada/)).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    expect(reserveKeys).toHaveLength(2);
    expect(reserveKeys[1]).not.toBe(reserveKeys[0]);
  });

  it('si no se pudo soltar el apartado reintenta con la misma llave y avisa', async () => {
    const cancelKeys: (string | null)[] = [];
    let cancelOk = false;
    server.use(
      ...baseHandlers(),
      http.post(`${baseUrl}/reservas`, () => ok(rental(), 201)),
      http.post(`${baseUrl}/reservas/${RENTAL_ID}/cancelacion`, ({ request }) => {
        cancelKeys.push(request.headers.get('Idempotency-Key'));
        return cancelOk ? ok({ id: RENTAL_ID, estado: 'cancelada' }) : fail(503, 'HTTP_ERROR', 'Sin respuesta');
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    await user.click(within(charge).getByRole('button', { name: 'No cobrar y soltar la pista' }));

    expect(await screen.findByText(/No se pudo soltar Pista 1: .*Revísala en Turnos de hoy/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(cancelKeys).toHaveLength(3);
    expect(new Set(cancelKeys).size).toBe(1);
    expect(cancelKeys[0]).toBeTruthy();

    // El botón de reintento manda la misma llave: si una cancelación anterior sí llegó, no es otra.
    cancelOk = true;
    await user.click(screen.getByRole('button', { name: 'Reintentar soltar Pista 1' }));
    await waitFor(() => expect(screen.queryByText(/No se pudo soltar/)).not.toBeInTheDocument());
    expect(cancelKeys).toHaveLength(4);
    expect(cancelKeys[3]).toBe(cancelKeys[0]);
  });

  it('si el servidor dice que la renta cambió de estado, avisa sin reintentar', async () => {
    const cancels: unknown[] = [];
    server.use(
      ...baseHandlers(),
      http.post(`${baseUrl}/reservas`, () => ok(rental(), 201)),
      http.post(`${baseUrl}/reservas/${RENTAL_ID}/cancelacion`, () => {
        cancels.push(RENTAL_ID);
        return HttpResponse.json({ data: null, meta: {}, error: { code: 'RESERVATION_NOT_CANCELLABLE', message: 'x', details: [{ estado_actual: 'confirmada' }] } }, { status: 409 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
    const charge = await screen.findByRole('dialog', { name: /Cobrar Pista 1/ });
    await user.click(within(charge).getByRole('button', { name: 'No cobrar y soltar la pista' }));
    expect(await screen.findByText(/No se pudo soltar Pista 1: la renta cambió de estado/)).toBeInTheDocument();
    expect(cancels).toHaveLength(1);
  });

  it('el nombre del cliente y de la pista se muestran escapados, sin interpretar HTML', async () => {
    const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    const posts: { nombre_cliente?: string }[] = [];
    const bookings: StaffBooking[] = [
      { id: RENTAL_ID, espacio: { id: 1, nombre: `Pista <b>1</b>` }, inicio: LATER, fin: LATER, monto: '300.00', estado: 'pendiente_pago', nombre_cliente: evil, jugadores: 2 },
    ];
    server.use(...baseHandlers({ bookings }), http.post(`${baseUrl}/reservas`, async ({ request }) => {
      posts.push(await request.json() as { nombre_cliente?: string });
      return fail(409, 'SLOT_TAKEN');
    }));
    const user = userEvent.setup();
    const { container } = renderPage();

    // Lo que se escribe en «A nombre de» viaja tal cual; escaparlo es trabajo de quien lo pinta.
    const lane1 = within(await screen.findByRole('list', { name: 'Pistas' })).getByRole('article', { name: 'Pista 1' });
    await user.click(within(lane1).getByRole('button', { name: 'Rentar ahora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rentar Pista 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar un jugador' }));
    await user.click(within(dialog).getByLabelText('A nombre de (opcional)'));
    await user.paste(evil);
    await user.click(within(dialog).getByRole('button', { name: 'Apartar · $300.00 MXN' }));
    await waitFor(() => expect(posts[0]?.nombre_cliente).toBe(evil));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Turnos de hoy' }));
    const list = await screen.findByRole('list', { name: 'Turnos de hoy' });
    expect(within(list).getByText((_, node) => node?.tagName === 'P' && Boolean(node.textContent?.includes(evil)))).toBeInTheDocument();
    expect(within(list).getByText(/Pista <b>1<\/b> ·/)).toBeInTheDocument();
    expect(container.querySelector('img[src="x"], script, b')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('reintentar guardar una pista manda la misma Idempotency-Key', async () => {
    session.rol = 'admin';
    const spaces: ManagedSpace[] = [{ id: 1, nombre: 'Pista 1', tipo: 'cancha', activo: true, qr_url: '', precio_hora: '300.00', capacidad: 6 }];
    const patchKeys: (string | null)[] = [];
    server.use(
      ...baseHandlers(),
      http.get(`${baseUrl}/espacios/administracion`, () => ok(spaces)),
      http.patch(`${baseUrl}/espacios/1`, ({ request }) => {
        patchKeys.push(request.headers.get('Idempotency-Key'));
        return patchKeys.length === 1 ? fail(503, 'HTTP_ERROR', 'Sin respuesta') : ok({ ...spaces[0], precio_hora: '350.00' });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('list', { name: 'Pistas' });
    await user.click(screen.getByRole('button', { name: 'Configurar pistas' }));
    const lanes = await screen.findByRole('list', { name: 'Pistas del negocio' });
    await user.click(within(lanes).getByRole('button', { name: 'Editar Pista 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar Pista 1' });
    const price = within(dialog).getByLabelText('Precio por hora');
    await user.clear(price);
    await user.type(price, '350');
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    await user.click(save);
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByText('Pista 1 guardada.')).toBeInTheDocument();
    expect(patchKeys).toHaveLength(2);
    expect(patchKeys[0]).toBeTruthy();
    expect(patchKeys[1]).toBe(patchKeys[0]);
  });

  it('el admin edita precio y capacidad de una pista y crea pistas en lote', async () => {
    session.rol = 'admin';
    const spaces: ManagedSpace[] = [
      { id: 1, nombre: 'Pista 1', tipo: 'cancha', activo: true, qr_url: '', precio_hora: '300.00', capacidad: 6 },
      { id: 9, nombre: 'Mesa 1', tipo: 'mesa', activo: true, qr_url: '', precio_hora: null },
    ];
    const patches: unknown[] = [];
    const batches: { key: string | null; body: unknown }[] = [];
    server.use(
      ...baseHandlers(),
      http.get(`${baseUrl}/espacios/administracion`, () => ok(spaces)),
      http.patch(`${baseUrl}/espacios/1`, async ({ request }) => {
        patches.push(await request.json());
        return ok({ ...spaces[0], precio_hora: '350.00', capacidad: 8 });
      }),
      http.post(`${baseUrl}/espacios/lote`, async ({ request }) => {
        batches.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        return ok({ tipo: 'cancha', solicitados: 2, creados: 1, omitidos: ['Pista 1'] }, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('list', { name: 'Pistas' });
    await user.click(screen.getByRole('button', { name: 'Configurar pistas' }));
    const lanes = await screen.findByRole('list', { name: 'Pistas del negocio' });
    expect(within(lanes).queryByText('Mesa 1')).not.toBeInTheDocument();
    expect(within(lanes).getByText('Renta $300.00 MXN por hora · Caben 6 jugadores')).toBeInTheDocument();

    await user.click(within(lanes).getByRole('button', { name: 'Editar Pista 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar Pista 1' });
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    const capacity = within(dialog).getByLabelText('Jugadores por pista');
    await user.clear(capacity);
    await user.type(capacity, '120');
    expect(within(dialog).getByText('De 1 a 99 jugadores.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(capacity);
    await user.type(capacity, '8');
    const price = within(dialog).getByLabelText('Precio por hora');
    await user.clear(price);
    await user.type(price, '350');
    await user.click(save);
    await waitFor(() => expect(patches).toEqual([{ precio_hora: '350.00', capacidad: 8 }]));
    expect(await screen.findByText('Pista 1 guardada.')).toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Crear pistas' });
    await user.clear(within(form).getByLabelText('Hasta'));
    await user.type(within(form).getByLabelText('Hasta'), '2');
    await user.click(within(form).getByRole('button', { name: 'Crear 2 pistas' }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.body).toEqual({ tipo: 'cancha', prefijo: 'Pista', desde: 1, hasta: 2, capacidad: 6 });
    expect(batches[0]?.key).toBeTruthy();
    expect(await screen.findByText(/Se creó 1 pista\. .* Ya existían: Pista 1\./)).toBeInTheDocument();
  });
});
