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
