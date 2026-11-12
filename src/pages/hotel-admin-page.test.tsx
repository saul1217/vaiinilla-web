import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { MemoryRouter, Route } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HOTEL_ADMIN_ENABLED } from '../lib/hotel-admin-feature';
import { settingsFixture, summaryFixture } from '../test/hotel-fixtures';
import { HotelAdminPage, type HotelAdminSection } from './hotel-admin-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: 'admin', establecimiento_id: 'hotel-1', membresia_id: 'm-1', usuario_id: 'u-1' } } }),
}));

let location = '';
function renderPage(section: HotelAdminSection, path = '/app/hotel') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = (children: ReactNode) => <MemoryRouter initialEntries={[path]}>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
    <Route path="*" render={({ location: current }) => { location = current.pathname; return null; }} />
  </MemoryRouter>;
  return render(wrap(<HotelAdminPage section={section} />));
}

const settingsHandler = (patch = {}) => http.get(`${baseUrl}/hotel/configuracion`, () => HttpResponse.json({ data: settingsFixture(patch), meta: {}, error: null }));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('bandera del admin de Hotel', () => {
  it('viene apagada por defecto', () => {
    expect(HOTEL_ADMIN_ENABLED).toBe(false);
  });
});

describe('HotelAdminPage', () => {
  it('en un negocio sin hotel no muestra secciones ni pide el resumen', async () => {
    server.use(settingsHandler({ activo: false }));
    renderPage('resumen');
    expect(await screen.findByText('Este negocio no tiene hotel')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Secciones del hotel' })).not.toBeInTheDocument();
  });

  it('pinta el resumen con ocupación, room service, solicitudes, lo más pedido y salidas', async () => {
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/hotel/resumen`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        return HttpResponse.json({ data: summaryFixture({ salidas_hoy: [{ estancia_id: 'e', huesped_nombre: 'Ana', habitacion: { id: 1, nombre: 'Habitación 304' }, salida_prevista: null }] }), meta: {}, error: null });
      }),
    );
    renderPage('resumen');
    expect(await screen.findByText('12 de 20')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Ocupación' })).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('$1840.00 MXN')).toBeInTheDocument();
    expect(screen.getByText('1 en cocina ahora')).toBeInTheDocument();
    expect(screen.getByText('La más vieja lleva 15 min')).toBeInTheDocument();
    expect(screen.getByText('Hamburguesa')).toBeInTheDocument();
    expect(screen.getByText('7 pedidos')).toBeInTheDocument();
    expect(screen.getByText('304 hace check-out')).toBeInTheDocument();
  });

  it('si falla el resumen deja reintentar', async () => {
    let calls = 0;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/hotel/resumen`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ data: null, meta: {}, error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500 })
          : HttpResponse.json({ data: summaryFixture(), meta: {}, error: null });
      }),
    );
    const user = userEvent.setup();
    renderPage('resumen');
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('12 de 20')).toBeInTheDocument();
  });

  it('las pestañas cambian de ruta', async () => {
    server.use(settingsHandler(), http.get(`${baseUrl}/hotel/resumen`, () => HttpResponse.json({ data: summaryFixture(), meta: {}, error: null })));
    const user = userEvent.setup();
    renderPage('resumen');
    await user.click(await screen.findByRole('radio', { name: 'Ajustes' }));
    expect(location).toBe('/app/hotel/ajustes');
  });

  it('lista las habitaciones en orden natural y crea un lote con Idempotency-Key', async () => {
    const bodies: unknown[] = [];
    const keys: (string | null)[] = [];
    let created = false;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/habitaciones`, () => HttpResponse.json({
        data: [
          { id: 2, nombre: 'Habitación 10', piso: 1, categoria: 'doble', limpieza: 'lista', ocupada: false, no_molestar: false, estancia: null, solicitudes_abiertas: 0, pedidos_en_curso: 0, qr_url: 'https://q/10' },
          { id: 1, nombre: 'Habitación 2', piso: 1, categoria: null, limpieza: 'lista', ocupada: true, no_molestar: false, estancia: null, solicitudes_abiertas: 0, pedidos_en_curso: 0, qr_url: 'https://q/2' },
          ...(created ? [{ id: 3, nombre: 'Suite 1', piso: 2, categoria: 'Suite', limpieza: 'lista', ocupada: false, no_molestar: false, estancia: null, solicitudes_abiertas: 0, pedidos_en_curso: 0, qr_url: 'https://q/s1' }] : []),
        ],
        meta: {}, error: null,
      })),
      http.post(`${baseUrl}/habitaciones/lote`, async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key'));
        if (bodies.length === 1) return HttpResponse.json({ data: null, meta: {}, error: { code: 'INTERNAL', message: 'Se cortó' } }, { status: 500 });
        created = true;
        return HttpResponse.json({ data: { solicitadas: 1, creadas: 1, convertidas: 0, omitidas: [] }, meta: {}, error: null }, { status: 201 });
      }),
      http.get(`${baseUrl}/hotel/resumen`, () => HttpResponse.json({ data: summaryFixture(), meta: {}, error: null })),
    );
    const user = userEvent.setup();
    renderPage('habitaciones', '/app/hotel/habitaciones');
    const list = await screen.findByRole('list', { name: 'Lista de habitaciones' });
    expect([...list.querySelectorAll('strong')].map((node) => node.textContent)).toEqual(['Habitación 2', 'Habitación 10']);
    expect(screen.getByText('Piso 1 · Doble · QR activo')).toBeInTheDocument();
    expect(screen.getByText('Piso 1 · ocupada')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Prefijo'));
    await user.type(screen.getByLabelText('Prefijo'), 'Suite');
    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '1');
    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '1');
    await user.clear(screen.getByLabelText('Piso'));
    await user.type(screen.getByLabelText('Piso'), '2');
    await user.type(screen.getByLabelText('Categoría'), 'Suite');
    await user.click(screen.getByRole('button', { name: 'Crear 1 habitación con QR' }));
    expect(await screen.findByText(/No se pudieron crear las habitaciones/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear 1 habitación con QR' }));
    expect(await screen.findByText('Se crearon 1 habitaciones')).toBeInTheDocument();
    expect(await screen.findByText('Suite 1')).toBeInTheDocument();
    expect(bodies[1]).toEqual({ prefijo: 'Suite', desde: 1, hasta: 1, piso: 2, categoria: 'Suite' });
    // El reintento del mismo lote reusa la llave para que el servidor no lo cree dos veces.
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('no deja crear un lote con números al revés', async () => {
    server.use(settingsHandler(), http.get(`${baseUrl}/habitaciones`, () => HttpResponse.json({ data: [], meta: {}, error: null })));
    const user = userEvent.setup();
    renderPage('habitaciones', '/app/hotel/habitaciones');
    expect(await screen.findByText('Todavía no hay habitaciones. Crea la primera arriba.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '5');
    expect(screen.getByRole('button', { name: 'Crear habitaciones con QR' })).toBeDisabled();
  });

  it('guarda los ajustes con PUT y solo con cambios válidos', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      settingsHandler(),
      http.put(`${baseUrl}/hotel/configuracion`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>;
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        return HttpResponse.json({ data: settingsFixture({ ...body, activo: true }), meta: {}, error: null });
      }),
    );
    const user = userEvent.setup();
    renderPage('ajustes', '/app/hotel/ajustes');
    const save = await screen.findByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText(/Pago con tarjeta al pedir/));
    await user.type(screen.getByLabelText('Cocina desde'), '7:00');
    expect(screen.getByText('El horario de cocina lleva las dos horas o ninguna.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Cocina hasta'), '23:00');
    await user.click(screen.getByLabelText(/Salida tardía/));
    await user.type(screen.getByLabelText('Precio de la salida tardía'), '150');
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(body).not.toHaveProperty('activo');
    expect(body).toMatchObject({
      tarjeta_al_pedir: false,
      cocina_desde: '07:00',
      cocina_hasta: '23:00',
      hora_checkout: '12:00',
      salida_tardia_hora: '15:00',
      salida_tardia_precio: '150.00',
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled());
  });
});
