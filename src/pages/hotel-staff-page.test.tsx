import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { requestFixture, roomFixture, settingsFixture, stayFixture } from '../test/hotel-fixtures';
import { HotelStaffPage, type HotelStaffSection } from './hotel-staff-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const ok = (data: unknown, status = 200) => HttpResponse.json({ data, meta: {}, error: null }, { status });
const fail = (status: number, code: string) => HttpResponse.json({ data: null, meta: {}, error: { code, message: code } }, { status });

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: 'cajero', establecimiento_id: 'hotel-1', membresia_id: 'm-1', usuario_id: 'u-1' } } }),
}));

function renderPage(section: HotelStaffSection) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><HotelStaffPage section={section} /></QueryClientProvider></MemoryRouter>);
}

const settingsHandler = (patch = {}) => http.get(`${baseUrl}/hotel/configuracion`, () => ok(settingsFixture(patch)));
const staysHandler = (stays = [stayFixture()]) => http.get(`${baseUrl}/estancias`, () => ok({ hoy: '2026-11-12', estancias: stays, limit: null, offset: 0, hay_mas: false }));
const roomsHandler = (rooms = [roomFixture()]) => http.get(`${baseUrl}/habitaciones`, () => ok(rooms));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('HotelStaffPage', () => {
  it('en un negocio sin hotel no pide estancias', async () => {
    server.use(settingsHandler({ activo: false }));
    renderPage('recepcion');
    expect(await screen.findByText('Este negocio no tiene hotel')).toBeInTheDocument();
  });

  it('Recepción separa salen hoy, en casa y por llegar con el día del hotel', async () => {
    server.use(settingsHandler(), roomsHandler(), staysHandler([
      stayFixture({ id: 'a', huesped: 'Ana', salida: '2026-11-12' }),
      stayFixture({ id: 'b', huesped: 'Beto', salida: '2026-11-20' }),
      stayFixture({ id: 'c', huesped: 'Caro', estado: 'reservada' }),
    ]));
    renderPage('recepcion');
    const leaving = await screen.findByRole('region', { name: 'Salen hoy' });
    expect(within(leaving).getByText('Ana')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'En casa' })).getByText('Beto')).toBeInTheDocument();
    const arriving = screen.getByRole('region', { name: 'Por llegar' });
    expect(within(arriving).getByRole('button', { name: 'Caro llegó' })).toBeInTheDocument();
  });

  it('«Llegó» manda la versión con Idempotency-Key', async () => {
    let body: unknown = null;
    let key: string | null = null;
    server.use(settingsHandler(), roomsHandler(), staysHandler([stayFixture({ id: 'c', huesped: 'Caro', estado: 'reservada', version: 4 })]),
      http.post(`${baseUrl}/estancias/c/check-in`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('Idempotency-Key');
        return ok(stayFixture({ id: 'c', huesped: 'Caro', version: 5 }), 201);
      }));
    const user = userEvent.setup();
    renderPage('recepcion');
    await user.click(await screen.findByRole('button', { name: 'Caro llegó' }));
    expect(await screen.findByText('Caro ya está en casa.')).toBeInTheDocument();
    expect(body).toEqual({ version_esperada: 4 });
    expect(key).toBeTruthy();
  });

  it('el check-in manda noches y tarifa y muestra el código de estancia', async () => {
    let body: unknown = null;
    server.use(settingsHandler(), staysHandler([]),
      roomsHandler([roomFixture({ id: 101, nombre: 'Habitación 101' }), roomFixture({ id: 102, nombre: 'Habitación 102', ocupada: true })]),
      http.post(`${baseUrl}/estancias`, async ({ request }) => {
        body = await request.json();
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        return ok(stayFixture({ huesped: 'Laura Ramos', codigo: '482915', espacio_nombre: 'Habitación 101' }), 201);
      }));
    const user = userEvent.setup();
    renderPage('recepcion');
    await user.click(await screen.findByRole('button', { name: 'Nuevo check-in' }));
    const submit = screen.getByRole('button', { name: 'Registrar llegada' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Nombre'), 'Laura Ramos');
    expect(await screen.findByRole('button', { name: 'Habitación 101' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Habitación 102' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Habitación 101' }));
    await user.click(screen.getByRole('button', { name: 'Una noche más' }));
    expect(screen.getByText('2 noches · sale el 14 de nov')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tarifa por noche'), '1650');
    await user.click(submit);
    expect(await screen.findByText('482 915')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Listo, Laura Ramos' })).toBeInTheDocument();
    expect(body).toEqual({ espacio_id: 101, huesped_nombre: 'Laura Ramos', noches: 2, tarifa_noche: '1650.00' });
  });

  it('un cargo manual va a la cuenta con categoría y concepto por defecto', async () => {
    let body: unknown = null;
    server.use(settingsHandler(), roomsHandler(), staysHandler([stayFixture({ salida: '2026-11-20' })]),
      http.post(`${baseUrl}/estancias/stay-1/cargos`, async ({ request }) => {
        body = await request.json();
        return ok(stayFixture(), 201);
      }));
    const user = userEvent.setup();
    renderPage('recepcion');
    await user.click(await screen.findByRole('button', { name: 'Cargo a Laura Ramos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Spa' }));
    await user.type(within(dialog).getByLabelText('Importe'), '0');
    expect(within(dialog).getByText('Escribe un importe mayor a cero, con hasta dos decimales.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Importe'));
    await user.type(within(dialog).getByLabelText('Importe'), '350.5');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar a la cuenta' }));
    expect(await screen.findByText('Se agregó Spa por $350.50 a la cuenta de Laura Ramos.')).toBeInTheDocument();
    expect(body).toEqual({ concepto: 'Spa', monto: '350.50', categoria: 'spa' });
  });

  it('el check-out muestra la cuenta, manda total y versión, y si cambió la recarga', async () => {
    const bodies: unknown[] = [];
    let detailCalls = 0;
    server.use(settingsHandler(), roomsHandler(), staysHandler([stayFixture()]),
      http.get(`${baseUrl}/estancias/stay-1`, () => {
        detailCalls += 1;
        return ok(detailCalls === 1
          ? stayFixture({ cargos: [{ id: 1, concepto: 'Agua', categoria: 'minibar', monto: '40.00', creado_en: null }],
            cuenta: { noches_total: '4950.00', cargos_total: '40.00', pedidos_total: '0.00', total: '4990.00', pedidos_pendientes: 0 }, total: '4990.00' })
          : stayFixture({ cargos: [{ id: 1, concepto: 'Agua', categoria: 'minibar', monto: '80.00', creado_en: null }],
            cuenta: { noches_total: '4950.00', cargos_total: '80.00', pedidos_total: '0.00', total: '5030.00', pedidos_pendientes: 0 }, total: '5030.00', version: 3 }));
      }),
      http.post(`${baseUrl}/estancias/stay-1/checkout`, async ({ request }) => {
        bodies.push(await request.json());
        return bodies.length === 1 ? fail(409, 'ACCOUNT_TOTAL_CHANGED') : ok(stayFixture({ estado: 'salio' }), 201);
      }));
    const user = userEvent.setup();
    renderPage('recepcion');
    await user.click(await screen.findByRole('button', { name: 'Check-out de Laura Ramos' }));
    expect(await screen.findByLabelText('Total a cobrar $4,990.00')).toBeInTheDocument();
    expect(screen.getByText('3 noches × $1,650')).toBeInTheDocument();
    expect(screen.getByText('Minibar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Efectivo' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar cuenta' }));
    expect(await screen.findByText(/La cuenta cambió mientras la revisabas/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Total a cobrar $5,030.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar cuenta' }));
    expect(await screen.findByText('Cuenta de Laura Ramos cerrada.')).toBeInTheDocument();
    expect(bodies).toEqual([
      { metodo_pago: 'efectivo', total_esperado: '4990.00', version_esperada: 2 },
      { metodo_pago: 'efectivo', total_esperado: '5030.00', version_esperada: 3 },
    ]);
  });

  it('el ama de llaves marca una habitación vacía y toma una solicitud', async () => {
    let cleaningBody: unknown = null;
    let transitionBody: unknown = null;
    server.use(settingsHandler(),
      roomsHandler([
        roomFixture({ id: 101, nombre: 'Habitación 101', piso: 1, limpieza: 'por_limpiar' }),
        roomFixture({ id: 102, nombre: 'Habitación 102', piso: 1, ocupada: true }),
      ]),
      http.get(`${baseUrl}/solicitudes-hotel`, () => ok([requestFixture({ version: 3 })])),
      http.post(`${baseUrl}/habitaciones/101/limpieza`, async ({ request }) => {
        cleaningBody = await request.json();
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        return ok({ id: 101, nombre: 'Habitación 101', limpieza: 'lista' }, 201);
      }),
      http.post(`${baseUrl}/solicitudes-hotel/req-1/transiciones`, async ({ request }) => {
        transitionBody = await request.json();
        return ok(requestFixture({ estado: 'tomada', version: 4 }), 201);
      }));
    const user = userEvent.setup();
    renderPage('ama-de-llaves');
    expect(await screen.findByText('Ama de llaves · Piso 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sucias 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Habitación 102: ocupada/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Habitación 101: por limpiar, marcar lista' }));
    await waitFor(() => expect(cleaningBody).toEqual({ limpieza: 'lista' }));
    await user.click(await screen.findByRole('button', { name: 'Tomar: 304 · 2 toallas' }));
    await waitFor(() => expect(transitionBody).toEqual({ accion: 'tomar', version_esperada: 3 }));
  });

  it('si otra persona ya atendió la solicitud lo dice', async () => {
    server.use(settingsHandler(), roomsHandler(),
      http.get(`${baseUrl}/solicitudes-hotel`, () => ok([requestFixture({ estado: 'tomada', tomada_por: { usuario_id: 'u2', nombre: 'Rosa' } })])),
      http.post(`${baseUrl}/solicitudes-hotel/req-1/transiciones`, () => fail(409, 'REQUEST_VERSION_CONFLICT')));
    const user = userEvent.setup();
    renderPage('ama-de-llaves');
    expect(await screen.findByText('Tomada por Rosa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Listo: 304 · 2 toallas' }));
    expect(await screen.findByText('Otra persona ya atendió esta solicitud. Ya está al día.')).toBeInTheDocument();
  });
});
