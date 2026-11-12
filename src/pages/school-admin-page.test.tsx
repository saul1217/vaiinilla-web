import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCHOOL_ADMIN_ENABLED } from '../lib/school-admin-feature';
import {
  guardianRequestFixture,
  guardianshipFixture,
  menuFixture,
  schoolSettingsFixture,
  studentRequestFixture,
} from '../test/school-fixtures';
import { SchoolAdminPage, type SchoolAdminSection } from './school-admin-page';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const uuid = /^[0-9a-f-]{36}$/i;

vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: 'admin', establecimiento_id: 'escuela-1', membresia_id: 'm-1', usuario_id: 'u-1' } } }),
}));

function renderPage(section: SchoolAdminSection) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouterWrap><QueryClientProvider client={client}><SchoolAdminPage section={section} /></QueryClientProvider></MemoryRouterWrap>);
}

function MemoryRouterWrap({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/app/escuela']}>{children}</MemoryRouter>;
}

const ok = (data: unknown) => HttpResponse.json({ data, meta: {}, error: null });
const settingsHandler = (patch = {}) => http.get(`${baseUrl}/establecimiento/configuracion`, () => ok(schoolSettingsFixture(patch)));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('bandera del admin de Escuela', () => {
  it('viene apagada por defecto', () => {
    expect(SCHOOL_ADMIN_ENABLED).toBe(false);
  });
});

describe('SchoolAdminPage', () => {
  it('en un negocio sin modo escuela no muestra secciones', async () => {
    server.use(settingsHandler({ modo_escuela: false }));
    renderPage('ajustes');
    expect(await screen.findByText('Este negocio no es escuela')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Secciones de la escuela' })).not.toBeInTheDocument();
  });

  it('cambia el código con confirmación y una Idempotency-Key', async () => {
    let body: unknown = null;
    let key: string | null = null;
    server.use(
      settingsHandler(),
      http.patch(`${baseUrl}/establecimiento/configuracion`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('Idempotency-Key');
        return ok(schoolSettingsFixture({ codigo_union: 'NUEVO1' }));
      }),
    );
    renderPage('ajustes');
    expect(await screen.findByText('K7Q2XM')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar código' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(await screen.findByText('NUEVO1')).toBeInTheDocument();
    expect(screen.getByText('Código nuevo listo')).toBeInTheDocument();
    expect(body).toEqual({ codigo_union: 'generar' });
    expect(key).toMatch(uuid);
  });

  it('guarda las reglas solo cuando cambian y son válidas', async () => {
    let body: unknown = null;
    server.use(
      settingsHandler(),
      http.patch(`${baseUrl}/establecimiento/configuracion`, async ({ request }) => {
        body = await request.json();
        return ok(schoolSettingsFixture({ dias_adelanto_pedido: 4 }));
      }),
    );
    renderPage('ajustes');
    const save = await screen.findByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    const minimum = screen.getByLabelText('Mínimo');
    await userEvent.clear(minimum);
    await userEvent.type(minimum, '3000');
    expect(screen.getByText('El mínimo de recarga no puede pasar del máximo.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await userEvent.clear(minimum);
    await userEvent.type(minimum, '50');
    await userEvent.click(screen.getByRole('button', { name: 'Un día más' }));
    await userEvent.click(save);
    await waitFor(() => expect(body).toEqual({
      dias_adelanto_pedido: 4, hora_corte_pedido: '09:00', hora_corte_cancelacion: null, recarga_minima: '50.00', recarga_maxima: '2000.00',
    }));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('en Cada día muestra lo apartado, guarda el menú y avisa de un día cerrado', async () => {
    const menuCalls: string[] = [];
    let saved: { url: string; body: unknown; key: string | null } | null = null;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/menu-dias`, ({ request }) => { menuCalls.push(new URL(request.url).search); return ok(menuFixture()); }),
      http.get(`${baseUrl}/catalogo`, () => ok({ categorias: [], productos: [
        { id: 1, nombre: 'Torta', precio_digital: '35.00', disponible: true },
        { id: 2, nombre: 'Agua', precio_digital: '15.00', disponible: true },
        { id: 3, nombre: 'Agotado', precio_digital: '10.00', disponible: false },
      ] })),
      http.get(`${baseUrl}/menu-dias/:fecha/apartados`, ({ params }) => ok({ fecha: params.fecha, pedidos: 2, sin_servicio: null, productos: [{ producto_id: 1, nombre: 'Torta', cantidad: 3, pedidos: 2 }] })),
      http.put(`${baseUrl}/menu-dias/:fecha`, async ({ request }) => {
        saved = { url: new URL(request.url).pathname, body: await request.json(), key: request.headers.get('Idempotency-Key') };
        return ok({ fecha: '2026-11-10', producto_ids: [1] });
      }),
    );
    renderPage('dias');
    expect(await screen.findByText('Apartado · 2 pedidos')).toBeInTheDocument();
    // Primero el "hoy" de la escuela y luego los 15 días con esas fechas.
    expect(menuCalls).toEqual(['', '?desde=2026-11-10&hasta=2026-11-24']);
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox', { name: /Agotado/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Torta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar menú · 1' }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved!.url).toBe('/api/v1/menu-dias/2026-11-10');
    expect(saved!.body).toEqual({ producto_ids: [1] });
    expect(saved!.key).toMatch(uuid);
    expect(await screen.findByText('Menú del día guardado')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Jueves 12, sin servicio' }));
    expect(screen.getByText('Junta de consejo técnico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a abrir' })).toBeInTheDocument();
  });

  it('cierra un día con motivo y dice cuánto regresó', async () => {
    let body: unknown = null;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/menu-dias`, () => ok(menuFixture({ sin_servicio: [] }))),
      http.get(`${baseUrl}/catalogo`, () => ok({ categorias: [], productos: [] })),
      http.get(`${baseUrl}/menu-dias/:fecha/apartados`, ({ params }) => ok({ fecha: params.fecha, pedidos: 1, sin_servicio: null, productos: [] })),
      http.put(`${baseUrl}/menu-dias/:fecha/sin-servicio`, async ({ request }) => {
        body = await request.json();
        return ok({ fecha: '2026-11-10', motivo: 'Lluvia', cancelados: 1, devuelto: '35.00', sin_cancelar: [] });
      }),
    );
    renderPage('dias');
    await screen.findByText('Apartado · 1 pedido');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar este día: no hay servicio' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Se cancela 1 apartado/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Cerrar el día' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Lluvia');
    await userEvent.click(confirm);
    expect(await screen.findByText('Día cerrado. Se canceló 1 apartado y regresaron $35 a su saldo.')).toBeInTheDocument();
    expect(body).toEqual({ motivo: 'Lluvia' });
  });

  it('pega el padrón, dice los problemas y guarda una lista limpia', async () => {
    let body: unknown = null;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/padron`, () => ok({ total: 0, alumnos: [] })),
      http.put(`${baseUrl}/padron`, async ({ request }) => {
        body = await request.json();
        return ok({ total: 2 });
      }),
    );
    renderPage('padron');
    await userEvent.click(await screen.findByRole('button', { name: 'Pegar lista' }));
    const dialog = await screen.findByRole('dialog');
    const area = within(dialog).getByLabelText('Alumnos');
    await userEvent.type(area, 'A-001, Ana, 3°B{enter}A-001, Otra');
    expect(within(dialog).getByText('Línea 2: matrícula repetida')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar padrón' })).toBeDisabled();
    await userEvent.clear(area);
    await userEvent.type(area, 'A-001, Ana, 3°B{enter}A-002, Beto, 3°B');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar padrón' }));
    expect(await screen.findByText('Padrón guardado: 2 alumnos')).toBeInTheDocument();
    expect(body).toEqual({ alumnos: [{ matricula: 'A-001', nombre: 'Ana', grupo: '3°B' }, { matricula: 'A-002', nombre: 'Beto', grupo: '3°B' }] });
    expect(screen.getByText('2 alumnos')).toBeInTheDocument();
    expect(screen.getByText('Grupo 3°B')).toBeInTheDocument();
  });

  it('al achicar el padrón confirma con el recuento y solo después llama a la API', async () => {
    const calls: unknown[] = [];
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/padron`, () => ok({ total: 3, alumnos: [
        { matricula: 'A-001', nombre: 'Ana', grupo: '3°B' },
        { matricula: 'A-002', nombre: 'Beto', grupo: '3°B' },
        { matricula: 'A-003', nombre: 'Caro', grupo: '3°B' },
      ] })),
      http.put(`${baseUrl}/padron`, async ({ request }) => {
        calls.push(await request.json());
        return ok({ total: 2 });
      }),
    );
    renderPage('padron');
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar lista' }));
    const dialog = await screen.findByRole('dialog');
    // Se quedan A-001, se van A-002 y A-003, entra A-009.
    await userEvent.type(within(dialog).getByLabelText('Alumnos'), 'a-001, Ana, 3°B{enter}A-009, Dani, 3°B');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar padrón' }));
    const confirm = within(dialog).getByRole('group', { name: '¿Reemplazar el padrón?' });
    expect(within(confirm).getByText('Se quitan 2, se agregan 1. Los hijos ya dados de alta se quedan.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    // Con «No» no se guarda y la lista pegada sigue ahí.
    await userEvent.click(within(confirm).getByRole('button', { name: 'No' }));
    expect(within(dialog).queryByRole('group', { name: '¿Reemplazar el padrón?' })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar padrón' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, reemplazar' }));
    expect(await screen.findByText('Padrón guardado: 2 alumnos')).toBeInTheDocument();
    expect(calls).toEqual([{ alumnos: [{ matricula: 'A-001', nombre: 'Ana', grupo: '3°B' }, { matricula: 'A-009', nombre: 'Dani', grupo: '3°B' }] }]);
  });

  it('quita el código para unirse solo después de confirmar', async () => {
    let body: unknown = null;
    server.use(
      settingsHandler(),
      http.patch(`${baseUrl}/establecimiento/configuracion`, async ({ request }) => {
        body = await request.json();
        return ok(schoolSettingsFixture({ codigo_union: null, union_requiere_codigo: false }));
      }),
    );
    renderPage('ajustes');
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar código' }));
    const confirm = screen.getByRole('group', { name: '¿Quitar el código?' });
    expect(body).toBeNull();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Ya no hay código para unirse')).toBeInTheDocument();
    expect(body).toEqual({ codigo_union: null, union_requiere_codigo: false });
  });

  it('aprueba un tutor y lo saca de la lista', async () => {
    let approved = '';
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/padron`, () => ok({ total: 1, alumnos: [{ matricula: 'Z-9', nombre: null, grupo: null }] })),
      http.get(`${baseUrl}/solicitudes-tutela`, () => ok([guardianRequestFixture()])),
      http.post(`${baseUrl}/solicitudes-tutela/:id/aprobar`, ({ params, request }) => {
        approved = String(params.id);
        expect(request.headers.get('Idempotency-Key')).toMatch(uuid);
        return ok({});
      }),
    );
    renderPage('tutores');
    expect(await screen.findByText('Ana Pérez · A-001 · 3°B')).toBeInTheDocument();
    expect(await screen.findByText('No está en el padrón · Sin otro tutor · Sin cuenta propia')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    // Se confirma antes de aprobar.
    const confirm = screen.getByRole('group', { name: '¿Aprobar a Laura Pérez?' });
    expect(approved).toBe('');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Laura Pérez ya cuida a Ana Pérez')).toBeInTheDocument();
    expect(approved).toBe(guardianRequestFixture().tutela_id);
    expect(screen.getByText(/Nadie espera/)).toBeInTheDocument();
  });

  it('busca quién cuida a un alumno y cambia quién pone los controles', async () => {
    const queries: string[] = [];
    let principal = '';
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/padron`, () => ok({ total: 0, alumnos: [] })),
      http.get(`${baseUrl}/solicitudes-tutela`, () => ok([])),
      http.get(`${baseUrl}/solicitudes-tutela/tutores`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q') ?? '');
        return ok([guardianshipFixture(), guardianshipFixture({ tutela_id: 't-mario', principal: false, tutor: { nombre: 'Mario Pérez', email: null } })]);
      }),
      http.post(`${baseUrl}/solicitudes-tutela/:id/principal`, ({ params }) => { principal = String(params.id); return ok({}); }),
    );
    renderPage('tutores');
    const search = await screen.findByLabelText('Alumno');
    await userEvent.type(search, 'A');
    expect(screen.getByText('Escribe al menos dos letras del nombre o la matrícula.')).toBeInTheDocument();
    await userEvent.type(search, 'na');
    expect(await screen.findByText('Mario Pérez')).toBeInTheDocument();
    expect(queries).toEqual(['Ana']);
    expect(screen.getByText('Pone los controles')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Que ponga los controles' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, que los ponga' }));
    expect(await screen.findByText('Ahora Mario Pérez pone los controles de Ana Pérez')).toBeInTheDocument();
    expect(principal).toBe('t-mario');
  });

  it('resuelve una devolución en efectivo y muestra el aviso de caja cerrada del servidor', async () => {
    let attempts = 0;
    const keys: (string | null)[] = [];
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/solicitudes-alumno`, () => ok([studentRequestFixture(), studentRequestFixture({ id: 'otro', tipo: 'desconocido' })])),
      http.post(`${baseUrl}/solicitudes-alumno/:id/resolver`, ({ request }) => {
        attempts += 1;
        keys.push(request.headers.get('Idempotency-Key'));
        if (attempts === 1) {
          return HttpResponse.json({ data: null, meta: {}, error: { code: 'CASH_SESSION_REQUIRED', message: 'Abre la caja para devolver efectivo: el dinero sale del cajón.' } }, { status: 422 });
        }
        return ok({});
      }),
    );
    renderPage('devoluciones');
    expect(await screen.findByText('Devolver $150 en efectivo')).toBeInTheDocument();
    // Un tipo que esta versión no conoce se omite.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Ya se lo entregué' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, ya se lo entregué' }));
    expect(await screen.findByText('Abre la caja para devolver efectivo: el dinero sale del cajón.')).toBeInTheDocument();
    // La confirmación sigue abierta para reintentar después de abrir la caja.
    await userEvent.click(screen.getByRole('button', { name: 'Sí, ya se lo entregué' }));
    expect(await screen.findByText('Listo: salieron $150 de la caja para Laura Pérez')).toBeInTheDocument();
    // El reintento del mismo cambio reusa su llave.
    expect(keys[0]).toMatch(uuid);
    expect(keys[1]).toBe(keys[0]);
  });

  it('rechaza una baja solo con motivo', async () => {
    let body: unknown = null;
    server.use(
      settingsHandler(),
      http.get(`${baseUrl}/solicitudes-alumno`, () => ok([studentRequestFixture({ tipo: 'baja_datos', como_devolver: null, saldo_actual: '0.00', saldo_al_pedir: '0.00' })])),
      http.post(`${baseUrl}/solicitudes-alumno/:id/rechazar`, async ({ request }) => { body = await request.json(); return ok({}); }),
    );
    renderPage('devoluciones');
    expect(await screen.findByText('Borrar sus datos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const group = screen.getByRole('group', { name: '¿Por qué no procede?' });
    const confirm = within(group).getByRole('button', { name: 'Rechazar' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(group).getByLabelText('Motivo'), 'Sigue inscrito');
    await userEvent.click(confirm);
    expect(await screen.findByText('Le avisamos a Laura Pérez')).toBeInTheDocument();
    expect(body).toEqual({ motivo: 'Sigue inscrito' });
  });
});
