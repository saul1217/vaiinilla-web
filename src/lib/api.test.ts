import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api } from './api';
import { VaiinillaApiError } from './api-error';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';

const server = setupServer();

const orderFixture = {
  id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
  folio: 42,
  fecha_operativa: '2026-08-11',
  estado: 'por_cobrar' as const,
  metodo_pago: 'efectivo' as const,
  destino: 'para_llevar' as const,
  espacio: null,
  subtotal: '26.00',
  ahorro_combinado: '0.00',
  cashback_otorgado: '0.00',
  total: '26.00',
  version: 1,
  creado_en: '2026-08-11T12:00:00Z',
  actualizado_en: '2026-08-11T12:00:00Z',
  notas_cocina: null,
  usuario: { nombre: 'Ana Pérez', matricula: 'A01234' },
  items: [
    {
      id: 501,
      producto_id: 101,
      nombre_producto: 'Chocolate frío',
      estacion_preparacion: 'caja' as const,
      cantidad: 1,
      precio_digital_unitario: '26.00',
      subtotal: '26.00',
      opciones: [],
    },
  ],
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Vaiinilla API client', () => {
  it('consulta versiones legales y solicita verificación por el backend', async () => {
    server.use(
      http.get(`${baseUrl}/publico/legal/vigente`, () =>
        HttpResponse.json({
          data: {
            terminos_version: '2026-07',
            terminos_url: 'https://app.vaiinilla.app/legal/terminos/2026-07',
            privacidad_version: '2026-07',
            privacidad_url: 'https://app.vaiinilla.app/legal/privacidad/2026-07',
          },
          meta: {},
          error: null,
        }),
      ),
      http.post(`${baseUrl}/publico/correos/verificacion`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
        return HttpResponse.json(
          { data: { aceptado: true }, meta: {}, error: null },
          { status: 202 },
        );
      }),
    );

    await expect(api.getLegalVersions()).resolves.toMatchObject({
      terminos_version: '2026-07',
    });
    await expect(api.requestEmailVerification('firebase-token')).resolves.toBeUndefined();
  });

  it('registra identidad con consentimiento e idempotencia', async () => {
    server.use(
      http.post(`${baseUrl}/identidad/alta`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          nombre: 'Ana Pérez',
          terminos_version: '2026-07',
          privacidad_version: '2026-07',
        });
        return HttpResponse.json(
          {
            data: {
              usuario: {
                id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
                nombre: 'Ana Pérez',
                email: 'ana@ejemplo.com',
                email_verificado_en: '2026-08-07T12:00:00Z',
              },
              consentimiento: {
                terminos_version: '2026-07',
                privacidad_version: '2026-07',
                aceptado_en: '2026-08-07T12:00:00Z',
              },
            },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
    );

    const result = await api.registerIdentity('firebase-token', {
      nombre: 'Ana Pérez',
      terminos_version: '2026-07',
      privacidad_version: '2026-07',
    });
    expect(result.usuario.nombre).toBe('Ana Pérez');
  });

  it('elimina la cuenta propia con token reciente y llave idempotente estable', async () => {
    const deletionKey = 'f5538f5a-ddea-40cb-a992-beb6ea4a91cd';
    server.use(
      http.delete(`${baseUrl}/identidad/cuenta`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token-reciente');
        expect(request.headers.get('Idempotency-Key')).toBe(deletionKey);
        await expect(request.json()).resolves.toEqual({ confirmacion: 'ELIMINAR' });
        return HttpResponse.json({
          data: {
            solicitud_id: '8a79bc4b-ffb9-44d1-a4a2-92dd8af08ef4',
            estado: 'eliminada',
            eliminada_en: '2026-08-18T12:00:00.000Z',
          },
          meta: {},
          error: null,
        });
      }),
    );

    await expect(
      api.deleteOwnAccount('firebase-token-reciente', deletionKey),
    ).resolves.toMatchObject({ estado: 'eliminada' });
  });

  it('solicita recuperación sin exponer si la cuenta existe', async () => {
    server.use(
      http.post(`${baseUrl}/publico/correos/recuperacion`, async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          email: 'ana@ejemplo.com',
        });
        return HttpResponse.json(
          { data: { aceptado: true }, meta: {}, error: null },
          { status: 202 },
        );
      }),
    );

    await expect(api.requestPasswordRecovery('ana@ejemplo.com')).resolves.toBeUndefined();
  });

  it('acepta la invitación enviando el token solo en el body', async () => {
    server.use(
      http.post(`${baseUrl}/invitaciones/aceptar`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer firebase-token');
        expect(request.headers.get('Idempotency-Key')).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(request.url).not.toContain('token-invitacion');
        await expect(request.json()).resolves.toEqual({
          token: 'token-invitacion',
        });
        return HttpResponse.json({
          data: {
            invitacion_id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
            membresia: {
              id: '5c96cbf1-178d-43b3-a1ed-2690e0658631',
              establecimiento_id: '4cb7a3de-34c3-4d53-b0dc-36ae45ea36ac',
              rol: 'admin',
              activo: true,
            },
            aceptada_en: '2026-08-05T20:00:00Z',
          },
          meta: {},
          error: null,
        });
      }),
    );

    const result = await api.acceptInvitation('firebase-token', 'token-invitacion');
    expect(result.membresia.rol).toBe('admin');
  });

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
        await expect(request.json()).resolves.toEqual({
          email: 'caja@ejemplo.com',
          rol: 'cajero',
        });
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

  it('consulta el estado y los pedidos operativos con el contexto del tenant', async () => {
    server.use(
      http.get(`${baseUrl}/estado-operativo`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        return HttpResponse.json({
          data: {
            recibiendo_pedidos: true,
            sesion_caja_abierta: true,
            caja_en_linea: true,
            cocina_en_linea: true,
            tiempo_estimado_min: 12,
            consultado_en: '2026-08-11T12:00:00Z',
          },
          meta: {},
          error: null,
        });
      }),
      http.get(`${baseUrl}/pedidos`, ({ request }) => {
        const url = new URL(request.url);
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        expect(url.searchParams.get('estado')).toBe('por_cobrar,listo');
        expect(url.searchParams.get('limit')).toBe('20');
        return HttpResponse.json({
          data: [orderFixture],
          meta: { cursor: 'next-page' },
          error: null,
        });
      }),
    );

    await expect(api.operationalStatus('tenant-token')).resolves.toMatchObject({
      recibiendo_pedidos: true,
    });
    await expect(
      api.listOrders('tenant-token', {
        estado: ['por_cobrar', 'listo'],
        limit: 20,
      }),
    ).resolves.toMatchObject({ orders: [{ folio: 42 }], cursor: 'next-page' });
  });

  it('cobra, entrega y registra el latido con los cuerpos aprobados', async () => {
    server.use(
      http.post(`${baseUrl}/pedidos/${orderFixture.id}/cobros-efectivo`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          monto_recibido: '100.00',
          version_esperada: 1,
        });
        return HttpResponse.json(
          {
            data: {
              pedido: { ...orderFixture, estado: 'listo', version: 3 },
              monto_recibido: '100.00',
              cambio: '74.00',
            },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
      http.post(`${baseUrl}/pedidos/${orderFixture.id}/transiciones`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          estado_objetivo: 'entregado',
          version_esperada: 3,
          qr_token: 'qr-opaco',
        });
        return HttpResponse.json(
          {
            data: { ...orderFixture, estado: 'entregado', version: 4 },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
      http.post(`${baseUrl}/latidos`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeNull();
        await expect(request.json()).resolves.toEqual({
          dispositivo: 'web-caja-01',
          rol: 'cajero',
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(
      api.collectCash('tenant-token', orderFixture.id, '100.00', 1),
    ).resolves.toMatchObject({ cambio: '74.00' });
    await expect(
      api.deliverOrder('tenant-token', orderFixture.id, 3, 'qr-opaco'),
    ).resolves.toMatchObject({ estado: 'entregado' });
    await expect(api.heartbeat('tenant-token', 'web-caja-01', 'cajero')).resolves.toBeUndefined();
  });

  it('avanza Cocina con versión esperada e idempotencia', async () => {
    server.use(
      http.post(`${baseUrl}/pedidos/${orderFixture.id}/transiciones`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          estado_objetivo: 'preparando',
          version_esperada: 2,
        });
        return HttpResponse.json(
          {
            data: { ...orderFixture, estado: 'preparando', version: 3 },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
    );

    await expect(
      api.transitionOrder('tenant-token', orderFixture.id, 'preparando', 2),
    ).resolves.toMatchObject({ estado: 'preparando', version: 3 });
  });

  it('administra el catálogo sin enviar el precio digital', async () => {
    const input = {
      categoria_id: 10,
      estacion_preparacion: 'caja' as const,
      nombre: 'Chocolate frío',
      descripcion: null,
      ingredientes: null,
      alergenos: null,
      tiempo_estimado_min: 5,
      precio_mostrador: '20.00',
      disponible: true,
      grupos_opcion: [],
    };
    const product = {
      id: 101,
      ...input,
      precio_digital: '26.00',
      imagen_url: null,
    };

    server.use(
      http.get(`${baseUrl}/catalogo`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        return HttpResponse.json({
          data: {
            categorias: [{ id: 10, nombre: 'Bebidas', orden: 0 }],
            productos: [product],
          },
          meta: {},
          error: null,
        });
      }),
      http.post(`${baseUrl}/catalogo/productos`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        const body = await request.json();
        expect(body).toEqual(input);
        expect(body).not.toHaveProperty('precio_digital');
        return HttpResponse.json({ data: product, meta: {}, error: null }, { status: 201 });
      }),
      http.post(`${baseUrl}/catalogo/categorias`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          nombre: 'Postres',
          orden: 20,
        });
        return HttpResponse.json(
          {
            data: { id: 30, nombre: 'Postres', orden: 20 },
            meta: {},
            error: null,
          },
          { status: 201 },
        );
      }),
      http.patch(`${baseUrl}/catalogo/categorias/30`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({ orden: 15 });
        return HttpResponse.json({
          data: { id: 30, nombre: 'Postres', orden: 15 },
          meta: {},
          error: null,
        });
      }),
      http.put(`${baseUrl}/catalogo/productos/101`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        const body = await request.json();
        expect(body).toEqual(input);
        expect(body).not.toHaveProperty('precio_digital');
        return HttpResponse.json({ data: product, meta: {}, error: null });
      }),
      http.post(`${baseUrl}/catalogo/productos/101/disponibilidad`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({ disponible: false });
        return HttpResponse.json({
          data: { ...product, disponible: false },
          meta: {},
          error: null,
        });
      }),
      http.put(`${baseUrl}/catalogo/productos/101/imagen`, async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        expect(request.headers.get('Content-Type')).toContain('multipart/form-data');
        expect((await request.arrayBuffer()).byteLength).toBeGreaterThan(0);
        return HttpResponse.json({
          data: { ...product, imagen_url: 'https://cdn.test/producto.png' },
          meta: {},
          error: null,
        });
      }),
      http.delete(`${baseUrl}/catalogo/productos/101/imagen`, ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        return HttpResponse.json({ data: product, meta: {}, error: null });
      }),
    );

    await expect(api.catalog('tenant-token')).resolves.toMatchObject({
      productos: [{ precio_digital: '26.00' }],
    });
    await expect(api.createProduct('tenant-token', input)).resolves.toMatchObject({ id: 101 });
    await expect(
      api.createCategory('tenant-token', { nombre: 'Postres', orden: 20 }),
    ).resolves.toMatchObject({ id: 30 });
    await expect(api.updateCategory('tenant-token', 30, { orden: 15 })).resolves.toMatchObject({
      orden: 15,
    });
    await expect(api.updateProduct('tenant-token', 101, input)).resolves.toMatchObject({
      id: 101,
    });
    await expect(api.changeProductAvailability('tenant-token', 101, false)).resolves.toMatchObject({
      disponible: false,
    });
    const image = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'producto.png',
      { type: 'image/png' },
    );
    await expect(api.uploadProductImage('tenant-token', 101, image)).resolves.toMatchObject({
      imagen_url: 'https://cdn.test/producto.png',
    });
    await expect(api.deleteProductImage('tenant-token', 101)).resolves.toMatchObject({
      imagen_url: null,
    });
  });

  it('convierte errores de dominio en mensajes claros', async () => {
    server.use(
      http.get(`${baseUrl}/plataforma/resumen`, () =>
        HttpResponse.json(
          {
            data: null,
            meta: {},
            error: {
              code: 'MFA_REQUIRED',
              message: 'Segundo factor requerido.',
            },
          },
          { status: 401 },
        ),
      ),
    );

    const promise = api.platformSummary('platform-token');
    await expect(promise).rejects.toBeInstanceOf(VaiinillaApiError);
    await expect(promise).rejects.toMatchObject({
      code: 'MFA_REQUIRED',
      status: 401,
    });
  });

  it('consulta métricas del tenant y de plataforma con el periodo seleccionado', async () => {
    const report = {
      periodo: { desde: '2026-08-01', hasta: '2026-08-12' },
      resumen: {
        ventas_totales: '200.00',
        pedidos: 5,
        ticket_promedio: '40.00',
        productos_vendidos: 6,
        recargas: '50.00',
        comisiones: '10.00',
      },
      ventas_por_dia: [],
      metodos_pago: [],
      pedidos_por_estado: [],
      productos: [],
      calculado_en: '2026-08-12T20:00:00Z',
    };
    server.use(
      http.get(`${baseUrl}/reportes/resumen`, ({ request }) => {
        const url = new URL(request.url);
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        expect(url.searchParams.get('desde')).toBe('2026-08-01');
        expect(url.searchParams.get('hasta')).toBe('2026-08-12');
        return HttpResponse.json({ data: report, meta: {}, error: null });
      }),
      http.get(`${baseUrl}/plataforma/metricas`, ({ request }) => {
        const url = new URL(request.url);
        expect(request.headers.get('Authorization')).toBe('Bearer platform-token');
        expect(url.searchParams.get('desde')).toBe('2026-08-01');
        expect(url.searchParams.get('hasta')).toBe('2026-08-12');
        return HttpResponse.json({
          data: { ...report, operacion: {}, establecimientos: [] },
          meta: {},
          error: null,
        });
      }),
    );

    const period = { desde: '2026-08-01', hasta: '2026-08-12' };
    await expect(api.tenantAnalytics('tenant-token', period)).resolves.toMatchObject({
      resumen: { pedidos: 5 },
    });
    await expect(api.platformAnalytics('platform-token', period)).resolves.toMatchObject({
      establecimientos: [],
    });
  });

  it('consulta y configura cashback con contexto e idempotencia', async () => {
    const rule = {
      id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
      nombre: 'Happy hour',
      porcentaje: '5.00',
      hora_inicio: '16:00:00',
      hora_fin: '19:00:00',
      dias_activos: [1, 2, 3, 4, 5],
      vigencia_inicio: '2026-08-01',
      vigencia_fin: '2026-08-31',
      activa: true,
      creado_en: '2026-08-13T12:00:00Z',
      actualizado_en: '2026-08-13T12:00:00Z',
    };
    server.use(
      http.get(`${baseUrl}/wallets/reglas-cashback`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        return HttpResponse.json({ data: rule, meta: {}, error: null });
      }),
      http.post(`${baseUrl}/wallets/reglas-cashback`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer tenant-token');
        expect(request.headers.get('Idempotency-Key')).toBeTruthy();
        await expect(request.json()).resolves.toEqual({
          nombre: 'Happy hour',
          porcentaje: '5.00',
          hora_inicio: '16:00',
          hora_fin: '19:00',
          dias_activos: [1, 2, 3, 4, 5],
          vigencia_inicio: '2026-08-01',
          vigencia_fin: '2026-08-31',
          activa: true,
        });
        return HttpResponse.json({ data: rule, meta: {}, error: null }, { status: 201 });
      }),
    );

    await expect(api.cashbackRule('tenant-token')).resolves.toMatchObject({
      porcentaje: '5.00',
    });
    await expect(
      api.configureCashback('tenant-token', {
        nombre: 'Happy hour',
        porcentaje: '5.00',
        hora_inicio: '16:00',
        hora_fin: '19:00',
        dias_activos: [1, 2, 3, 4, 5],
        vigencia_inicio: '2026-08-01',
        vigencia_fin: '2026-08-31',
        activa: true,
      }),
    ).resolves.toMatchObject({ activa: true });
  });
});
