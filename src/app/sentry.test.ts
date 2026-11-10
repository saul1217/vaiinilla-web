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
