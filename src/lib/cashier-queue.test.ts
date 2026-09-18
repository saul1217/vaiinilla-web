import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import {
  canConfirmCashierDelivery,
  isCashierCashOrder,
  isCashierDeliveryOrder,
} from './cashier-queue';

function order(overrides: Partial<OrderDetail>): OrderDetail {
  return {
    id: 'ord-1',
    folio: 1,
    fecha_operativa: '2026-09-17',
    estado: 'listo',
    metodo_pago: 'stripe',
    destino: 'para_llevar',
    espacio: null,
    subtotal: '10.00',
    ahorro_combinado: '0.00',
    cashback_otorgado: '0.00',
    total: '10.00',
    version: 2,
    creado_en: '2026-09-17T12:00:00Z',
    actualizado_en: '2026-09-17T12:10:00Z',
    notas_cocina: null,
    usuario: { nombre: 'Ana', matricula: null },
    items: [],
    ...overrides,
  };
}

describe('cashier-queue', () => {
  it('cobra solo por_cobrar y entrega cualquier listo, incluida mesa', () => {
    expect(isCashierCashOrder(order({ estado: 'por_cobrar' }))).toBe(true);
    expect(isCashierDeliveryOrder(order({ estado: 'listo', destino: 'para_llevar' }))).toBe(true);
    expect(
      isCashierDeliveryOrder(
        order({
          estado: 'listo',
          destino: 'en_espacio',
          espacio: { id: 3, nombre: 'Mesa 3', tipo: 'mesa' },
        }),
      ),
    ).toBe(true);
    expect(isCashierDeliveryOrder(order({ estado: 'preparando' }))).toBe(false);
    expect(canConfirmCashierDelivery(order({ estado: 'listo' }), '  token  ')).toBe(true);
    expect(canConfirmCashierDelivery(order({ estado: 'listo' }), '   ')).toBe(false);
    expect(canConfirmCashierDelivery(order({ estado: 'preparando' }), 'token')).toBe(false);
  });
});
