import { describe, expect, it } from 'vitest';
import { pickupBody } from './api';

describe('pickupBody: QR o código de 4 dígitos al entregar', () => {
  it('4 dígitos van como código de recoger', () => {
    expect(pickupBody('0133')).toEqual({ codigo_recoger: '0133' });
    expect(pickupBody(' 4821 ')).toEqual({ codigo_recoger: '4821' });
  });

  it('lo demás es el token del QR', () => {
    expect(pickupBody('v1.abc123')).toEqual({ qr_token: 'v1.abc123' });
    expect(pickupBody('12345')).toEqual({ qr_token: '12345' });
  });

  it('vacío no manda nada', () => {
    expect(pickupBody('')).toEqual({});
    expect(pickupBody(undefined)).toEqual({});
  });
});
