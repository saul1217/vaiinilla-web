import { describe, expect, it } from 'vitest';
import { deliveryRequiresQr } from './delivery-policy';

describe('política de QR de entrega', () => {
  it('dispensa QR para cualquier pedido de una sesión de mesa abierta', () => {
    expect(deliveryRequiresQr({
      destino: 'en_espacio', sesion_espacio_id: 'session-1', sesion_espacio_estado: 'abierta',
    }, true)).toBe(false);
  });

  it('aplica el ajuste configurado a pedidos para llevar', () => {
    expect(deliveryRequiresQr({ destino: 'para_llevar' }, true)).toBe(true);
    expect(deliveryRequiresQr({ destino: 'para_llevar' }, false)).toBe(false);
    expect(deliveryRequiresQr({ destino: 'para_llevar' })).toBe(true);
  });

  it('conserva el ajuste para pedidos en espacio sin sesión activa válida', () => {
    expect(deliveryRequiresQr({ destino: 'en_espacio', sesion_espacio_id: null }, true)).toBe(true);
    expect(deliveryRequiresQr({
      destino: 'en_espacio', sesion_espacio_id: 'closed-session', sesion_espacio_estado: 'cerrada',
    }, true)).toBe(true);
    expect(deliveryRequiresQr({ destino: 'en_espacio', sesion_espacio_id: null }, false)).toBe(false);
  });
});
