import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api } from './api';
import { VaiinillaApiError } from './api-error';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Vaiinilla API client', () => {
  it('envía el token Firebase al consultar accesos', async () => {
    server.use(
      http.get(`${baseUrl}/sesiones/accesos`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
        return HttpResponse.json({
          data: [
            {
              membresia_id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
              establecimiento: {
                id: '4cb7a3de-34c3-4d53-b0dc-36ae45ea36ac',
                nombre: 'Cafetería Centro',
                slug: 'cafeteria-centro',
              },
              rol: 'admin',
              identificador_cliente: null,
              estado_establecimiento: 'activo',
              cierre_operativo_disponible: false,
            },
          ],
          meta: {},
          error: null,
        });
      }),
    );

    const accesses = await api.listAccesses('firebase-token');
    expect(accesses).toHaveLength(1);
    expect(accesses[0]?.rol).toBe('admin');
  });

  it('agrega una llave idempotente al crear una invitación', async () => {
    server.use(
      http.post(`${baseUrl}/personal/invitaciones`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        expect(request.headers.get('Idempotency-Key')).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        await expect(request.json()).resolves.toEqual({ email: 'caja@ejemplo.com', rol: 'cajero' });
        return HttpResponse.json(
          {
            data: {
              id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
              email: 'caja@ejemplo.com',
              rol: 'cajero',
              estado: 'pendiente',
              expira_en: '2026-08-08T20:00:00Z',
              creado_en: '2026-08-05T20:00:00Z',
              reemplaza_invitacion_id: null,
            },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
    );

    const invitation = await api.createInvitation('tenant-token', {
      email: 'caja@ejemplo.com',
      rol: 'cajero',
    });
    expect(invitation.estado).toBe('pendiente');
  });

  it('convierte errores de dominio en mensajes claros', async () => {
    server.use(
      http.get(`${baseUrl}/plataforma/resumen`, () =>
        HttpResponse.json(
          {
            data: null,
            meta: {},
            error: { code: 'MFA_REQUIRED', message: 'Segundo factor requerido.' },
          },
          { status: 401 },
        ),
      ),
    );

    const promise = api.platformSummary('platform-token');
    await expect(promise).rejects.toBeInstanceOf(VaiinillaApiError);
    await expect(promise).rejects.toMatchObject({ code: 'MFA_REQUIRED', status: 401 });
  });
});
