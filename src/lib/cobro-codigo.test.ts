import { describe, expect, it } from 'vitest';
import { paymentNeedsProof, paymentProofMode } from './cobro-codigo';

describe('cobro con código', () => {
  it('solo lo pedido en la app, con la opción prendida y sin cuenta de mesa', () => {
    const on = { cobro_requiere_codigo: true };
    expect(paymentNeedsProof({ origen: 'app' }, on)).toBe(true);
    expect(paymentNeedsProof({ origen: 'mostrador' }, on)).toBe(false);
    expect(paymentNeedsProof({ origen: 'villo' }, on)).toBe(false);
    expect(paymentNeedsProof({ origen: 'app', pago_diferido: true }, on)).toBe(false);
    expect(paymentNeedsProof({ origen: 'app' }, { cobro_requiere_codigo: false })).toBe(false);
    expect(paymentNeedsProof({ origen: 'app' }, undefined)).toBe(false);
    expect(paymentNeedsProof({}, on)).toBe(false);
  });

  it('pide la prueba de la entrega; «sin validar» cobra con QR o código', () => {
    expect(paymentProofMode('qr')).toBe('qr');
    expect(paymentProofMode('codigo')).toBe('codigo');
    expect(paymentProofMode('ninguna')).toBe('qr_o_codigo');
    expect(paymentProofMode(undefined)).toBe('qr_o_codigo');
  });
});
