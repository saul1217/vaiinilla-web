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
const session = vi.hoisted(() => ({
  tenant: { token: 'tenant-token', context: { rol: 'cajero', establecimiento_id: 'e-1', membresia_id: 'm-1' } },
}));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: session.tenant }) }));

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
  const tree = () => <MemoryRouter><QueryClientProvider client={client}><AgendaPage /></QueryClientProvider></MemoryRouter>;
  const view = render(tree());
  return { ...view, rerender: () => view.rerender(tree()) };
}

const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ data: null, meta: {}, error: { code, message, ...(details ? { details } : {}) } }, { status });

const cashRefund = {
  id: 'rb-1', metodo: 'efectivo', monto: '200.00', monto_pagado: '450.00', salida: 'caja', saldo_nuevo: null,
  creado_en: '2099-11-10T06:00:00.000Z', devolucion_id: null, sesion_caja_id: 'cs-1',
};

async function openPaidCancel(user: ReturnType<typeof userEvent.setup>) {
  const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
  await user.click(within(list).getByRole('button', { name: 'Cancelar y reembolsar' }));
  return screen.findByRole('dialog', { name: 'Cancelar reserva pagada' });
}

async function fillRefund(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, amount: string, reason = 'Lluvia') {
  const field = within(dialog).getByLabelText('Monto a reembolsar');
  await user.clear(field);
  await user.type(field, amount);
  await user.type(within(dialog).getByLabelText('Motivo (3 a 240 caracteres)'), reason);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  session.tenant = { token: 'tenant-token', context: { rol: 'cajero', establecimiento_id: 'e-1', membresia_id: 'm-1' } };
});
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

  it('cancela una pagada con monto de reembolso y motivo, y muestra en el modal la vía y el monto que registró el back', async () => {
    const bodies: unknown[] = [];
    const log: string[] = [];
    server.use(
      ...baseHandlers(log),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, async ({ params, request }) => {
        bodies.push({ id: params.id, ...(await request.json() as object) });
        // El back registra 150 aunque se pidieron 200: el modal debe enseñar lo que respondió.
        return ok({ id: params.id, estado: 'cancelada', reembolso: { ...cashRefund, monto: '150.00' } });
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
    const result = await screen.findByRole('dialog', { name: 'Reserva cancelada' });
    expect(within(result).getByText('Reembolso: $150.00 MXN de $450.00 MXN pagados (efectivo)')).toBeInTheDocument();
    expect(within(result).getByText('Sale en efectivo de la caja abierta: entrégalo al cliente.')).toBeInTheDocument();
    // La agenda se actualiza detrás mientras el modal enseña el reembolso.
    await waitFor(() => expect(log.filter((line) => line === 'GET reservas 2099-11-10')).toHaveLength(2));
    await user.click(within(result).getByRole('button', { name: 'Listo' }));
    expect(await screen.findByText('Reserva cancelada y reembolso registrado.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bodies).toEqual([{ id: 'r-2', motivo: 'Lluvia', monto_reembolso: '200.00' }]);
  });

  it('muestra la devolución pendiente de tarjeta y el saldo nuevo de la cartera', async () => {
    let refund: object = { ...cashRefund, metodo: 'tarjeta', salida: 'devolucion_pendiente', sesion_caja_id: null, devolucion_id: 'd-1' };
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params }) => ok({ id: params.id, estado: 'cancelada', reembolso: refund })),
    );
    const user = userEvent.setup();
    const view = renderPage();
    let dialog = await openPaidCancel(user);
    await fillRefund(user, dialog, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    let result = await screen.findByRole('dialog', { name: 'Reserva cancelada' });
    expect(within(result).getByText('Reembolso: $200.00 MXN de $450.00 MXN pagados (tarjeta)')).toBeInTheDocument();
    expect(within(result).getByText('Quedó como devolución pendiente: Caja la confirma en Devoluciones.')).toBeInTheDocument();
    await user.click(within(result).getByRole('button', { name: 'Listo' }));
    view.unmount();

    refund = { ...cashRefund, metodo: 'saldo', salida: 'cartera', saldo_nuevo: '980.00', sesion_caja_id: null };
    renderPage();
    dialog = await openPaidCancel(user);
    await fillRefund(user, dialog, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    result = await screen.findByRole('dialog', { name: 'Reserva cancelada' });
    expect(within(result).getByText('Reembolso: $200.00 MXN de $450.00 MXN pagados (saldo)')).toBeInTheDocument();
    expect(within(result).getByText('Regresó a la cartera del cliente. Su saldo ahora es $980.00 MXN.')).toBeInTheDocument();
  });

  it('no deja reembolsar más de lo pagado y enseña el tope que manda el back', async () => {
    const bodies: unknown[] = [];
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, async ({ request }) => {
        bodies.push(await request.json());
        return fail(422, 'REFUND_AMOUNT_EXCEEDS_PAID', 'El reembolso supera lo pagado.', [{ monto_pagado: '400.00' }]);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const dialog = await openPaidCancel(user);
    const confirm = within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' });
    expect(within(dialog).getByText(/El tope es orientativo: el servidor revisa lo que se pagó y decide el monto final/)).toBeInTheDocument();
    await fillRefund(user, dialog, '450.01');
    expect(within(dialog).getByText('El reembolso no puede ser mayor a lo pagado.')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    const amount = within(dialog).getByLabelText('Monto a reembolsar');
    await user.clear(amount);
    await user.type(amount, '450');
    expect(within(dialog).queryByText('El reembolso no puede ser mayor a lo pagado.')).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
    // Si el back tiene otro total pagado, su 422 manda el tope real.
    await user.click(confirm);
    expect(await within(dialog).findByText('El reembolso no puede ser mayor a lo pagado ($400.00 MXN).')).toBeInTheDocument();
    expect(bodies).toEqual([{ motivo: 'Lluvia', monto_reembolso: '450.00' }]);
    // Ya enviado, el monto queda fijo aunque el back lo rechace: se cambia abriendo otra cancelación.
    expect(within(dialog).getByLabelText('Monto a reembolsar')).toHaveAttribute('readonly');
  });

  it('reintentar la cancelación en el mismo modal manda la misma Idempotency-Key, y otro modal manda otra', async () => {
    const keys: (string | null)[] = [];
    const bodies: unknown[] = [];
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, async ({ params, request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        bodies.push(await request.json());
        if (keys.length === 1) return fail(503, 'SERVICE_UNAVAILABLE', 'El servidor no respondió.');
        if (keys.length === 2) return HttpResponse.error();
        return ok({ id: params.id, estado: 'cancelada', reembolso: cashRefund });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    let dialog = await openPaidCancel(user);
    await fillRefund(user, dialog, '200');
    const confirm = within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' });
    await user.click(confirm);
    expect(await within(dialog).findByText('El servidor no respondió.')).toBeInTheDocument();
    // Monto y motivo quedan fijos: escribir en ellos no cambia lo que se reenvía con la misma llave.
    const amount = within(dialog).getByLabelText('Monto a reembolsar');
    const reason = within(dialog).getByLabelText('Motivo (3 a 240 caracteres)');
    expect(amount).toHaveAttribute('readonly');
    expect(reason).toHaveAttribute('readonly');
    expect(within(dialog).getByText(/quedan fijos para reintentar sin reembolsar dos veces/)).toBeInTheDocument();
    await user.type(amount, '9');
    await user.type(reason, ' y granizo');
    expect(amount).toHaveValue('200.00');
    expect(reason).toHaveValue('Lluvia');
    await user.click(confirm);
    await waitFor(() => expect(keys).toHaveLength(2));
    await waitFor(() => expect(confirm).toBeEnabled());
    // Cerrar y volver a abrir es otra cancelación: llave nueva.
    await user.click(within(dialog).getByRole('button', { name: 'No, conservar' }));
    dialog = await openPaidCancel(user);
    await fillRefund(user, dialog, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    await screen.findByRole('dialog', { name: 'Reserva cancelada' });
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[2]).not.toBe(keys[0]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({ motivo: 'Lluvia', monto_reembolso: '200.00' });
  });

  it('con 409 de reserva ya cancelada lo dice y actualiza la agenda', async () => {
    const log: string[] = [];
    server.use(
      ...baseHandlers(log),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, () =>
        fail(409, 'RESERVATION_NOT_CANCELLABLE', 'Esta reserva ya no se puede cancelar.', [{ estado_actual: 'cancelada' }])),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar reserva' });
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    expect(await within(dialog).findByText('Esta reserva ya estaba cancelada o cambió de estado. Actualizamos la agenda.')).toBeInTheDocument();
    await waitFor(() => expect(log.filter((line) => line === 'GET reservas 2099-11-10')).toHaveLength(2));
    expect(screen.queryByText(/Reserva cancelada/)).not.toBeInTheDocument();
  });

  it('al cambiar de membresía cierra el modal y vuelve a leer la agenda con la sesión nueva', async () => {
    const tokens: string[] = [];
    server.use(
      http.get(`${baseUrl}/reservas/disponibilidad`, ({ request }) => {
        tokens.push(`disponibilidad ${request.headers.get('Authorization')}`);
        return ok(dayFixture());
      }),
      http.get(`${baseUrl}/reservas`, ({ request }) => {
        const token = request.headers.get('Authorization');
        tokens.push(`reservas ${token}`);
        return ok(token === 'Bearer tenant-token' ? [pending, paid] : []);
      }),
    );
    const user = userEvent.setup();
    const view = renderPage();
    await openPaidCancel(user);
    session.tenant = { token: 'other-token', context: { rol: 'admin', establecimiento_id: 'e-2', membresia_id: 'm-2' } };
    view.rerender();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Sin reservas este día.')).toBeInTheDocument();
    expect(screen.queryByText(/Luis/)).not.toBeInTheDocument();
    expect(tokens).toEqual([
      'disponibilidad Bearer tenant-token', 'reservas Bearer tenant-token',
      'disponibilidad Bearer other-token', 'reservas Bearer other-token',
    ]);
  });

  it('pinta como texto un nombre de cliente con HTML, en la fila y en el modal', async () => {
    const evil = '<img src=x onerror="window.__agendaXss=1"><script>window.__agendaXss=1</script>';
    server.use(
      // Antes que los de base: en MSW gana el primero que coincide.
      http.get(`${baseUrl}/reservas`, () => ok([{ ...paid, nombre_cliente: evil }])),
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params }) => ok({ id: params.id, estado: 'cancelada', reembolso: cashRefund })),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    expect(within(list).getByText((text) => text.startsWith(evil))).toBeInTheDocument();
    const dialog = await openPaidCancel(user);
    expect(within(dialog).getByText((text) => text.includes(evil))).toBeInTheDocument();
    await fillRefund(user, dialog, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));
    const result = await screen.findByRole('dialog', { name: 'Reserva cancelada' });
    expect(within(result).getByText((text) => text.includes(evil))).toBeInTheDocument();
    expect(container.querySelector('img, script')).toBeNull();
    expect(document.body.querySelector('img, script')).toBeNull();
    expect((window as { __agendaXss?: number }).__agendaXss).toBeUndefined();
  });

  it('reintentar Apartar en el mismo modal reusa las llaves del apartado', async () => {
    const keys: (string | null)[] = [];
    let createCalls = 0;
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas`, ({ request }) => {
        keys.push(`crear ${request.headers.get('Idempotency-Key')}`);
        createCalls += 1;
        return createCalls === 1 ? HttpResponse.error() : ok({ id: 'r-9', estado: 'pendiente_pago' }, 201);
      }),
      http.post(`${baseUrl}/reservas/:id/pago`, ({ request }) => {
        keys.push(`pago ${request.headers.get('Idempotency-Key')}`);
        return ok({}, 201);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const free = await screen.findByRole('group', { name: 'Horarios libres de Cancha 1' });
    await user.click(within(free).getByRole('button', { name: '09:30' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    const save = within(dialog).getByRole('button', { name: 'Apartar' });
    await user.click(save);
    await waitFor(() => expect(createCalls).toBe(1));
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(await screen.findByText(/Reserva creada en Cancha 1/)).toBeInTheDocument();
    const [first, second, pay] = keys;
    expect(second).toBe(first);
    expect(pay?.startsWith('pago ')).toBe(true);
    expect(pay?.slice(5)).not.toBe(first?.slice(6));
  });

  it('al mover, si el apartado nuevo se soltó, el siguiente intento usa llaves nuevas', async () => {
    const calls: string[] = [];
    let cancelOriginal = 0;
    server.use(
      ...baseHandlers([]),
      http.post(`${baseUrl}/reservas`, ({ request }) => { calls.push(`crear ${request.headers.get('Idempotency-Key')}`); return ok({ id: `r-new${calls.length}` }, 201); }),
      http.post(`${baseUrl}/reservas/:id/pago`, ({ request }) => { calls.push(`pago ${request.headers.get('Idempotency-Key')}`); return ok({}, 201); }),
      http.post(`${baseUrl}/reservas/:id/cancelacion`, ({ params, request }) => {
        calls.push(`cancelar ${String(params.id)} ${request.headers.get('Idempotency-Key')}`);
        // Un 409 no se reintenta dentro de moveBooking (un 500 sí, con las esperas de #158).
        if (params.id === 'r-1' && ++cancelOriginal === 1) {
          return fail(409, 'RESERVATION_NOT_CANCELLABLE', 'Esta reserva ya no se puede cancelar.', [{ estado_actual: 'en_curso' }]);
        }
        return ok({ id: params.id, estado: 'cancelada', reembolso: null });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reservas de Cancha 1' });
    await user.click(within(list).getByRole('button', { name: 'Mover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover reserva' });
    await user.selectOptions(within(dialog).getByLabelText('Empieza'), '2099-11-10T09:30:00.000Z');
    await user.click(within(dialog).getByRole('button', { name: 'Mover reserva' }));
    expect(await within(dialog).findByText('No se pudo soltar el horario original. La reserva sigue en su horario original.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Mover reserva' }));
    expect(await screen.findByText(/Reserva movida a Cancha 1/)).toBeInTheDocument();
    const key = (line: string) => line.split(' ').at(-1);
    // Primer intento: crear, pago, cancelar original (falla) y soltar el nuevo, cada uno con su llave.
    expect(calls.map((line) => line.split(' ').slice(0, -1).join(' '))).toEqual([
      'crear', 'pago', 'cancelar r-1', 'cancelar r-new1', 'crear', 'pago', 'cancelar r-1',
    ]);
    const firstTry = calls.slice(0, 4).map(key);
    expect(new Set(firstTry).size).toBe(4);
    const secondTry = calls.slice(4).map(key);
    for (const value of secondTry) expect(firstTry).not.toContain(value);
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
