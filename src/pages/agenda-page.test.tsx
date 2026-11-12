import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CourtAvailabilityDay, StaffBooking } from '../types/api';
import { AgendaPage } from './agenda-page';

vi.mock('../lib/agenda-feature', () => ({ AGENDA_ENABLED: true }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: 'cajero', establecimiento_id: 'e-1', membresia_id: 'm-1' } } }),
}));

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const ok = (data: unknown, status = 200) => HttpResponse.json({ data, meta: {}, error: null }, { status });

// Fechas lejanas para que «ya empezó» no dependa del reloj de la prueba. Zona UTC para leer las horas.
const dayFixture = (fecha = '2099-11-10'): CourtAvailabilityDay => ({
  fecha,
  hoy: '2099-11-10',
  zona_horaria: 'UTC',
  apertura: '07:00',
  cierre: '14:00',
  abre: `${fecha}T07:00:00.000Z`,
  cierra: `${fecha}T14:00:00.000Z`,
  bloque_min: 30,
  duraciones_min: [90, 180],
  dias_adelanto: 2,
  ahora: '2099-11-10T06:00:00.000Z',
  canchas: [
    {
      espacio: { id: 7, nombre: 'Cancha 1', tipo: 'cancha' },
      precio_hora: '300.00',
      rentable: true,
      duraciones_min: [90, 180],
      ocupado: fecha === '2099-11-10'
        ? [{ inicio: '2099-11-10T08:00:00.000Z', fin: '2099-11-10T09:30:00.000Z', motivo: 'reserva' }, { inicio: '2099-11-10T11:00:00.000Z', fin: '2099-11-10T12:30:00.000Z', motivo: 'reserva' }]
        : [],
    },
    { espacio: { id: 9, nombre: 'Mesa 3', tipo: 'mesa' }, precio_hora: null, rentable: false, ocupado: [] },
  ],
});

const pending: StaffBooking = {
  id: 'r-1', espacio: { id: 7, nombre: 'Cancha 1' }, inicio: '2099-11-10T08:00:00.000Z', fin: '2099-11-10T09:30:00.000Z',
  duracion_min: 90, monto: '450.00', estado: 'pendiente_pago', expira_en: '2099-11-10T08:15:00.000Z', nombre_cliente: 'Ana', pedido_id: 'p-1', canal: 'mostrador',
};
const paid: StaffBooking = {
  id: 'r-2', espacio: { id: 7, nombre: 'Cancha 1' }, inicio: '2099-11-10T11:00:00.000Z', fin: '2099-11-10T12:30:00.000Z',
  duracion_min: 90, monto: '450.00', estado: 'confirmada', nombre_cliente: 'Luis', pedido_id: 'p-2', canal: 'cliente',
};
const cancelled: StaffBooking = { ...pending, id: 'r-0', estado: 'cancelada', nombre_cliente: 'Olvidada' };

function baseHandlers(log: string[]) {
  return [
    http.get(`${baseUrl}/reservas/disponibilidad`, ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
      const fecha = new URL(request.url).searchParams.get('fecha') ?? undefined;
      log.push(`GET disponibilidad ${fecha ?? 'hoy'}`);
      return ok(dayFixture(fecha));
    }),
    http.get(`${baseUrl}/reservas`, ({ request }) => {
      const fecha = new URL(request.url).searchParams.get('fecha');
      log.push(`GET reservas ${fecha}`);
      return ok(fecha === '2099-11-10' ? [cancelled, pending, paid] : []);
    }),
  ];
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><AgendaPage /></QueryClientProvider></MemoryRouter>);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AgendaPage', () => {
  it('pinta las reservas vivas del día por cancha, sus acciones y los horarios libres', async () => {
    const log: string[] = [];
    server.use(...baseHandlers(log));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('08:00–09:30')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Ana · 1 h 30 min/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Mover' })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: 'Cancelar y reembolsar' })).toBeInTheDocument();
    expect(screen.queryByText(/Olvidada/)).not.toBeInTheDocument();
    expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument();
    const free = screen.getByRole('group', { name: 'Horarios libres de Cancha 1' });
    expect(within(free).getAllByRole('button').map((button) => button.textContent)).toEqual(['09:30', '12:30']);
    expect(log).toEqual(['GET disponibilidad hoy', 'GET reservas 2099-11-10']);
  });

  it('cambia de día con los chips', async () => {
    const log: string[] = [];
    server.use(...baseHandlers(log));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(screen.getByRole('group', { name: 'Día de la agenda' })).getByRole('button', { name: 'Mañana' }));
    expect(await screen.findByText('Sin reservas este día.')).toBeInTheDocument();
    expect(log).toContain('GET disponibilidad 2099-11-11');
    expect(log).toContain('GET reservas 2099-11-11');
  });

  it('crea una reserva desde un horario libre y la deja por cobrar en Caja', async () => {
    const log: string[] = [];
    const bodies: unknown[] = [];
    server.use(
      ...baseHandlers(log),
      http.post(`${baseUrl}/reservas`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        bodies.push(await request.json());
        return ok({ id: 'r-9', estado: 'pendiente_pago' }, 201);
      }),
      http.post(`${baseUrl}/reservas/:id/pago`, async ({ params, request }) => {
        bodies.push({ pago: params.id, ...(await request.json() as object) });
        return ok({ reserva: { id: params.id } }, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const free = await screen.findByRole('group', { name: 'Horarios libres de Cancha 1' });
    await user.click(within(free).getByRole('button', { name: '09:30' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    await user.type(within(dialog).getByLabelText('Nombre del cliente (opcional)'), 'Marta');
    await user.click(within(dialog).getByRole('button', { name: 'Apartar' }));
    expect(await screen.findByText(/Reserva creada en Cancha 1, hoy a las 09:30/)).toBeInTheDocument();
    expect(bodies).toEqual([
      { espacio_id: 7, inicio: '2099-11-10T09:30:00.000Z', duracion_min: 90, nombre_cliente: 'Marta' },
      { pago: 'r-9', metodo_pago: 'efectivo' },
    ]);
  });

  it('mueve una pendiente a otro día: aparta el nuevo, lo deja por cobrar y cancela el original', async () => {
    const log: string[] = [];
    const calls: string[] = [];
    server.use(
      ...baseHandlers(log),
      http.post(`${baseUrl}/reservas`, async ({ request }) => {
        const body = await request.json() as { inicio: string; duracion_min: number; nombre_cliente: string };
        calls.push(`crear ${body.inicio} ${body.duracion_min} ${body.nombre_cliente}`);
        return ok({ id: 'r-new' }, 201);
      }),
      http.post(`${baseUrl}/reservas/:id/pago`, ({ params }) => { calls.push(`pago ${String(params.id)}`); return ok({}, 201); }),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params }) => { calls.push(`cancelar ${String(params.id)}`); return ok({ id: params.id, estado: 'cancelada' }); }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Mover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover reserva' });
    await user.selectOptions(within(dialog).getByLabelText('Día'), '2099-11-11');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: '07:00' })).toBeInTheDocument());
    await user.selectOptions(within(dialog).getByLabelText('Empieza'), '2099-11-11T07:00:00.000Z');
    expect(within(dialog).getByLabelText('Duración')).toHaveValue('90');
    await user.click(within(dialog).getByRole('button', { name: 'Mover reserva' }));
    expect(await screen.findByText(/Reserva movida a Cancha 1, mañana a las 07:00/)).toBeInTheDocument();
    expect(calls).toEqual(['crear 2099-11-11T07:00:00.000Z 90 Ana', 'pago r-new', 'cancelar r-1']);
  });

  it('si el undo falla no da el movimiento por hecho, avisa del apartado por cobrar y deja soltarlo con la misma llave', async () => {
    const calls: string[] = [];
    let undoUp = false;
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas`, () => ok({ id: 'r-new' }, 201)),
      http.post(`${baseUrl}/reservas/:id/pago`, () => ok({}, 201)),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params, request }) => {
        const id = String(params.id);
        calls.push(`cancelar ${id} ${request.headers.get('Idempotency-Key') ?? ''}`);
        if (id === 'r-1') return HttpResponse.json({ data: null, meta: {}, error: { code: 'RESERVATION_NOT_CANCELLABLE', message: 'Esta reserva ya no se puede cancelar.', details: [{ estado_actual: 'en_curso' }] } }, { status: 409 });
        if (!undoUp) return HttpResponse.json({ data: null, meta: {}, error: { code: 'UNAVAILABLE', message: 'Servicio no disponible.' } }, { status: 503 });
        return ok({ id, estado: 'cancelada' });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Mover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover reserva' });
    await user.selectOptions(within(dialog).getByLabelText('Empieza'), '2099-11-10T09:30:00.000Z');
    await user.click(within(dialog).getByRole('button', { name: 'Mover reserva' }));
    expect(await within(dialog).findByText(/el horario nuevo también quedó apartado y está por cobrar en Caja\. No lo cobres/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/Reserva movida/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Mover reserva' })).not.toBeInTheDocument();
    const undoCalls = calls.filter((call) => call.startsWith('cancelar r-new'));
    expect(undoCalls).toHaveLength(3);
    expect(new Set(undoCalls).size).toBe(1);

    undoUp = true;
    await user.click(within(dialog).getByRole('button', { name: 'Soltar el horario nuevo' }));
    expect(await screen.findByText('No se movió la reserva: sigue en su horario original y el horario nuevo quedó libre.')).toBeInTheDocument();
    expect(calls.at(-1)).toBe(undoCalls[0]);
  }, 15000);

  it('si el horario nuevo ya está tomado lo dice y no cancela la original', async () => {
    const calls: string[] = [];
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas`, () => HttpResponse.json({ data: null, meta: {}, error: { code: 'SLOT_TAKEN', message: 'Ese horario ya está tomado.' } }, { status: 409 })),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params }) => { calls.push(`cancelar ${String(params.id)}`); return ok({}); }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Mover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover reserva' });
    await user.selectOptions(within(dialog).getByLabelText('Empieza'), '2099-11-10T09:30:00.000Z');
    await user.click(within(dialog).getByRole('button', { name: 'Mover reserva' }));
    expect(await within(dialog).findByText('Ese horario ya está tomado.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('cancela una pagada con monto de reembolso y motivo', async () => {
    const bodies: unknown[] = [];
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, async ({ params, request }) => {
        bodies.push({ id: params.id, ...(await request.json() as object) });
        return ok({ id: params.id, estado: 'cancelada', reembolso: null });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Cancelar y reembolsar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar reserva pagada' });
    const confirm = within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' });
    expect(confirm).toBeDisabled();
    const amount = within(dialog).getByLabelText('Monto a reembolsar');
    await user.clear(amount);
    await user.type(amount, '200');
    await user.type(within(dialog).getByLabelText('Motivo (3 a 240 caracteres)'), 'Lluvia');
    await user.click(confirm);
    expect(await screen.findByText('Reserva cancelada y reembolso registrado.')).toBeInTheDocument();
    expect(bodies).toEqual([{ id: 'r-2', motivo: 'Lluvia', monto_reembolso: '200.00' }]);
  });

  it('cancela una pendiente sin cuerpo de reembolso', async () => {
    const bodies: string[] = [];
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, async ({ params, request }) => {
        bodies.push(`${String(params.id)}:${await request.text()}`);
        return ok({ id: params.id, estado: 'cancelada', reembolso: null });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar reserva' });
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    expect(await screen.findByText('Reserva cancelada. El horario quedó libre.')).toBeInTheDocument();
    expect(bodies).toEqual(['r-1:']);
  });
});
