import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const ok = (data: unknown) => HttpResponse.json({ data, meta: {}, error: null });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); });
afterAll(() => server.close());

describe('asistente de la tienda en segundo plano', () => {
  it('manda el trabajo, pregunta hasta que está listo y regresa la respuesta', async () => {
    let polls = 0;
    let sent: unknown = null;
    server.use(
      http.post(`${baseUrl}/establecimiento/asistente/trabajos`, async ({ request }) => {
        sent = await request.json();
        return ok({ trabajo_id: 'job-1', estado: 'pensando' });
      }),
      http.get(`${baseUrl}/establecimiento/asistente/trabajos/job-1`, () => {
        polls += 1;
        return polls < 2 ? ok({ trabajo_id: 'job-1', estado: 'pensando' }) : ok({ trabajo_id: 'job-1', estado: 'listo', respuesta: { mensaje: 'Hola', opciones: ['Sí'], quedan_mensajes: 58 } });
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    const reply = api.askStoreAssistant('t', [{ rol: 'dueno', texto: 'Hola' }]);
    await vi.advanceTimersByTimeAsync(4100);
    await expect(reply).resolves.toMatchObject({ mensaje: 'Hola', quedan_mensajes: 58 });
    expect(polls).toBe(2);
    expect(sent).toEqual({ mensajes: [{ rol: 'dueno', texto: 'Hola' }] });
  });

  it('si el trabajo falla, regresa el mensaje del servidor', async () => {
    server.use(
      http.post(`${baseUrl}/establecimiento/asistente/trabajos`, () => ok({ trabajo_id: 'job-2', estado: 'pensando' })),
      http.get(`${baseUrl}/establecimiento/asistente/trabajos/job-2`, () => ok({ trabajo_id: 'job-2', estado: 'error', error: { code: 'ASSISTANT_UNAVAILABLE', message: 'El asistente está ocupado.' } })),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    const reply = api.askStoreAssistant('t', [{ rol: 'dueno', texto: 'Hola' }]);
    const check = expect(reply).rejects.toThrow('El asistente está ocupado.');
    await vi.advanceTimersByTimeAsync(2100);
    await check;
  });

  it('al cancelar deja de preguntar', async () => {
    const poll = vi.fn(() => ok({ trabajo_id: 'job-3', estado: 'pensando' }));
    server.use(
      http.post(`${baseUrl}/establecimiento/asistente/trabajos`, () => ok({ trabajo_id: 'job-3', estado: 'pensando' })),
      http.get(`${baseUrl}/establecimiento/asistente/trabajos/job-3`, poll),
    );
    const controller = new AbortController();
    const reply = api.askStoreAssistant('t', [{ rol: 'dueno', texto: 'Hola' }], [], controller.signal);
    const check = expect(reply).rejects.toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await check;
    expect(poll).not.toHaveBeenCalled();
  });
});
