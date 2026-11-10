import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { beforeBreadcrumb, beforeSend, scrubUrl } from './sentry';

describe('sentry scrubbing', () => {
  it('limpia token y nuevo de las URLs', () => {
    expect(scrubUrl('https://x.app/a?token=abc123&b=1')).toBe('https://x.app/a?token=[Filtered]&b=1');
    expect(scrubUrl('/login?nuevo=1')).toBe('/login?nuevo=[Filtered]');
  });

  it('elimina Authorization, usuario y correos del evento', () => {
    const event = {
      user: { email: 'a@b.com' },
      request: { url: 'https://x.app/?token=zzz', headers: { Authorization: 'Bearer q', Accept: '*/*' } },
    } as unknown as ErrorEvent;
    const out = beforeSend(event);
    expect(out.user).toBeUndefined();
    expect(out.request?.headers).toEqual({ Accept: '*/*' });
    expect(out.request?.url).not.toContain('zzz');
  });

  it('limpia breadcrumbs', () => {
    const b = beforeBreadcrumb({ category: 'navigation', data: { from: '/a?token=1', to: '/b?nuevo=1' } });
    expect(JSON.stringify(b)).not.toMatch(/token=1|nuevo=1/);
  });
});

// JWT de ejemplo (no real), armado en partes para que el escáner de secretos no lo tome por uno.
const JWT = [btoa('{"alg":"HS256"}'), btoa('{"sub":"prueba"}'), 'firma_de_prueba_123'].join('.').replace(/=/g, '');
const VILLO = 'villo_3q2-7wY2mJ0Qx0b1K9f8VgW5hN4cR6tZ1uA2sD3fG4h';

describe('sentry: redacción de tokens en breadcrumbs y cuerpos JSON', () => {
  it('redacta token, access_token, villo_ y JWT en un breadcrumb y conserva lo demás', () => {
    const b = beforeBreadcrumb({
      category: 'fetch',
      message: `Authorization: Bearer ${VILLO} y ${JWT}`,
      data: {
        method: 'POST',
        status_code: 200,
        token: 'abc',
        respuesta: { access_token: 'xyz', dispositivo: VILLO, sesion: JWT, nombre: 'Caja 1' },
        body: JSON.stringify({ token: 'secreto', mesa: 4 }),
      },
    });
    expect(b?.message).toBe('Authorization: Bearer [Filtered] y [Filtered]');
    expect(b?.data).toEqual({
      method: 'POST',
      status_code: 200,
      token: '[Filtered]',
      respuesta: { access_token: '[Filtered]', dispositivo: '[Filtered]', sesion: '[Filtered]', nombre: 'Caja 1' },
      body: JSON.stringify({ token: '[Filtered]', mesa: 4 }),
    });
    expect(b?.category).toBe('fetch');
  });

  it('redacta un evento con cuerpo JSON anidado sin perder el resto', () => {
    const event = {
      message: `fallo con {"access_token":"${JWT}"} en la caja`,
      exception: { values: [{ type: 'Error', value: `401 con ${VILLO}` }] },
      request: { url: 'https://x.app/pedidos', data: { password: 'nunca' } },
      extra: {
        payload: { pedido: { id: 7, items: [{ sku: 'A1', token: 't1' }, { nota: JWT }] }, Token: 'mayus' },
        cuerpo: `{"datos":{"token":"${VILLO}","total":120}}`,
      },
      contexts: { villo: { dispositivo: { access_token: 'x', modelo: 'Sunmi' } } },
      breadcrumbs: [{ category: 'xhr', data: { respuesta: [{ token: 'abc', ok: true }] } }],
    } as unknown as ErrorEvent;
    const out = beforeSend(event);
    expect(out.message).toBe('fallo con {"access_token":"[Filtered]"} en la caja');
    expect(out.exception?.values?.[0]).toEqual({ type: 'Error', value: '401 con [Filtered]' });
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.url).toBe('https://x.app/pedidos');
    expect(out.extra).toEqual({
      payload: {
        pedido: { id: 7, items: [{ sku: 'A1', token: '[Filtered]' }, { nota: '[Filtered]' }] },
        Token: '[Filtered]',
      },
      cuerpo: JSON.stringify({ datos: { token: '[Filtered]', total: 120 } }),
    });
    expect(out.contexts).toEqual({ villo: { dispositivo: { access_token: '[Filtered]', modelo: 'Sunmi' } } });
    expect(out.breadcrumbs?.[0]?.data).toEqual({ respuesta: [{ token: '[Filtered]', ok: true }] });
    expect(JSON.stringify(out)).not.toMatch(/eyJ|villo_3q2|"t1"|secreto/);
  });

  it('no cambia nada cuando no hay datos sensibles', () => {
    const data = {
      url: 'https://api.vaiinilla.app/v1/pedidos?page=2',
      host: 'api.vaiinilla.app',
      version: '1.2.10',
      ruta: 'villo/dispositivos',
      pedido: { id: 9, items: [{ sku: 'B2', cantidad: 3 }], total: 99.5, pagado: false, nota: null },
    };
    const original = structuredClone(data);
    const b = beforeBreadcrumb({ category: 'fetch', message: 'GET /v1/pedidos 200', data });
    expect(b).toEqual({ category: 'fetch', message: 'GET /v1/pedidos 200', data: original });

    const event = { message: 'Error de red', extra: { pedido: { id: 1, mesa: '4' } } } as unknown as ErrorEvent;
    expect(beforeSend(event)).toEqual({ message: 'Error de red', extra: { pedido: { id: 1, mesa: '4' } } });
  });
});

describe('sentry: claves sensibles nuevas y query_string en sus tres formas', () => {
  it('redacta refresh_token, id_token, password, secret y cookie en cualquier nivel', () => {
    const b = beforeBreadcrumb({
      category: 'fetch',
      message: '{"refresh_token":"r1", "otro":1',
      data: {
        refresh_token: 'r1',
        ID_TOKEN: 'i1',
        sesion: { password: 'p1', secret: 's1', cookie: 'c1', nombre: 'Ana' },
        body: JSON.stringify({ password: 'p2', mesa: 2 }),
      },
    });
    expect(b?.message).toBe('{"refresh_token":"[Filtered]", "otro":1');
    expect(b?.data).toEqual({
      refresh_token: '[Filtered]',
      ID_TOKEN: '[Filtered]',
      sesion: { password: '[Filtered]', secret: '[Filtered]', cookie: '[Filtered]', nombre: 'Ana' },
      body: JSON.stringify({ password: '[Filtered]', mesa: 2 }),
    });
  });

  const evento = (query_string: unknown) =>
    beforeSend({ request: { url: 'https://x.app/a', query_string } } as unknown as ErrorEvent).request?.query_string;

  it('redacta query_string como cadena', () => {
    expect(
      evento(`password=p&secret=s&refresh_token=r&id_token=i&cookie=c&d=${VILLO}&j=${JWT}&mesa=4&nuevo=1`),
    ).toBe(
      'password=[Filtered]&secret=[Filtered]&refresh_token=[Filtered]&id_token=[Filtered]&cookie=[Filtered]' +
        '&d=[Filtered]&j=[Filtered]&mesa=4&nuevo=[Filtered]',
    );
    expect(evento('token=abc&b=1')).toBe('token=[Filtered]&b=1');
  });

  it('redacta query_string como objeto', () => {
    expect(
      evento({ password: 'p', Secret: 's', cookie: 'c', d: VILLO, j: JWT, mesa: '4', token: 't', nuevo: '1' }),
    ).toEqual({
      password: '[Filtered]',
      Secret: '[Filtered]',
      cookie: '[Filtered]',
      d: '[Filtered]',
      j: '[Filtered]',
      mesa: '4',
      token: '[Filtered]',
      nuevo: '[Filtered]',
    });
  });

  it('redacta query_string como lista de pares [clave, valor]', () => {
    expect(
      evento([
        ['refresh_token', 'r'],
        ['id_token', 'i'],
        ['password', 'p'],
        ['d', VILLO],
        ['j', JWT],
        ['mesa', '4'],
        ['correo', 'a@b.com'],
      ]),
    ).toEqual([
      ['refresh_token', '[Filtered]'],
      ['id_token', '[Filtered]'],
      ['password', '[Filtered]'],
      ['d', '[Filtered]'],
      ['j', '[Filtered]'],
      ['mesa', '4'],
      ['correo', '[email]'],
    ]);
  });
});

describe('sentry: parámetro de búsqueda q (nombre o matrícula de un menor)', () => {
  const URL_TUTORES = 'https://api.x.app/solicitudes-tutela/tutores?q=Juan%20P%C3%A9rez&page=2&limit=20';
  const URL_TAPADA = 'https://api.x.app/solicitudes-tutela/tutores?q=[Filtered]&page=2&limit=20';

  it('tapa q en request.url y deja los demás parámetros', () => {
    const e = beforeSend({ request: { url: URL_TUTORES } } as unknown as ErrorEvent);
    expect(e.request?.url).toBe(URL_TAPADA);
    expect(scrubUrl('/solicitudes-tutela/tutores?page=1&q=A12345')).toBe('/solicitudes-tutela/tutores?page=1&q=[Filtered]');
  });

  it('no toca parámetros que solo terminan en q (faq, seq) ni otros que empiezan con q', () => {
    expect(scrubUrl('/a?faq=1&seq=2&qr=3')).toBe('/a?faq=1&seq=2&qr=3');
  });

  it('tapa q aunque traiga espacios sin codificar o venga en mayúscula', () => {
    expect(scrubUrl('/tutores?q=Juan Pérez López&page=2')).toBe('/tutores?q=[Filtered]&page=2');
    expect(scrubUrl('/tutores?Q=A12345#top')).toBe('/tutores?Q=[Filtered]#top');
  });

  it('tapa q en breadcrumbs de fetch, xhr y navegación', () => {
    const fetch = beforeBreadcrumb({
      category: 'fetch',
      data: { method: 'GET', url: URL_TUTORES, status_code: 200 },
    });
    expect(fetch?.data).toEqual({ method: 'GET', url: URL_TAPADA, status_code: 200 });

    const xhr = beforeBreadcrumb({ category: 'xhr', data: { method: 'GET', url: '/solicitudes-tutela/tutores?q=A12345' } });
    expect(xhr?.data?.url).toBe('/solicitudes-tutela/tutores?q=[Filtered]');

    const nav = beforeBreadcrumb({
      category: 'navigation',
      data: { from: '/app/escuela/tutores?q=Ana', to: '/app/escuela/padron?q=A12345&grupo=3B' },
    });
    expect(nav?.data).toEqual({ from: '/app/escuela/tutores?q=[Filtered]', to: '/app/escuela/padron?q=[Filtered]&grupo=3B' });

    const msg = beforeBreadcrumb({ category: 'console', message: 'GET /solicitudes-tutela/tutores?q=Ana&page=1 falló' });
    expect(msg?.message).toBe('GET /solicitudes-tutela/tutores?q=[Filtered]&page=1 falló');
  });

  it('tapa q en los breadcrumbs que ya vienen dentro del evento', () => {
    const e = beforeSend({
      breadcrumbs: [{ category: 'fetch', data: { url: URL_TUTORES } }],
    } as unknown as ErrorEvent);
    expect(e.breadcrumbs?.[0]?.data?.url).toBe(URL_TAPADA);
  });

  const evento = (query_string: unknown) =>
    beforeSend({ request: { url: 'https://x.app/a', query_string } } as unknown as ErrorEvent).request?.query_string;

  it('tapa q en query_string como cadena, con y sin ?', () => {
    expect(evento('q=Juan%20P%C3%A9rez&page=2')).toBe('q=[Filtered]&page=2');
    expect(evento('?page=2&q=A12345')).toBe('?page=2&q=[Filtered]');
    expect(evento('q=Juan Pérez&page=2')).toBe('q=[Filtered]&page=2');
    expect(evento('faq=1&seq=2')).toBe('faq=1&seq=2');
  });

  it('tapa q en query_string como objeto, con el valor ya decodificado', () => {
    expect(evento({ q: 'Juan Pérez López', page: '2', Q: 'A12345' })).toEqual({
      q: '[Filtered]',
      page: '2',
      Q: '[Filtered]',
    });
  });

  it('tapa q en query_string como lista de pares', () => {
    expect(
      evento([
        ['q', 'Juan Pérez'],
        ['page', '2'],
        ['q', 'A12345'],
      ]),
    ).toEqual([
      ['q', '[Filtered]'],
      ['page', '2'],
      ['q', '[Filtered]'],
    ]);
  });

  it('no tapa una clave q dentro de objetos JSON que no son query', () => {
    const b = beforeBreadcrumb({ category: 'ui', data: { q: 'texto', otra: 1 } });
    expect(b?.data).toEqual({ q: 'texto', otra: 1 });
  });
});
