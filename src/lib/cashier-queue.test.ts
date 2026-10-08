import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import {
  canConfirmCashierDelivery,
  hasOutstandingCashBalance,
  isCashierCashOrder,
  isCashierDeferredDeliveryOrder,
  isCashierDeliveryOrder,
  isCashierPaidDeliveryOrder,
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
    monto_pagado: '10.00',
    saldo_pendiente: '0.00',
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
  it('separa recibido de pago pendiente y entrega cualquier listo, incluida mesa', () => {
    expect(isCashierCashOrder(order({
      estado: 'cobrado',
      estado_operativo: 'recibido',
      estado_pago: 'pendiente',
      metodo_pago: 'efectivo',
      monto_pagado: '0.00',
      saldo_pendiente: '10.00',
    }))).toBe(true);
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
    expect(isCashierDeliveryOrder(order({ estado: 'cobrado', estado_operativo: 'preparando' }))).toBe(false);
    expect(canConfirmCashierDelivery(order({ estado: 'listo' }), '  token  ')).toBe(true);
    expect(canConfirmCashierDelivery(order({ estado: 'listo' }), '   ')).toBe(false);
    expect(canConfirmCashierDelivery(order({ estado: 'preparando' }), 'token')).toBe(false);
  });

  it('mantiene LISTO mientras siga pendiente y permite entregar solo al quedar pagado', () => {
    const unpaid = order({ estado: 'listo', metodo_pago: 'efectivo', saldo_pendiente: '125.00', monto_pagado: '0.00' });
    expect(hasOutstandingCashBalance(unpaid)).toBe(true);
    expect(isCashierDeliveryOrder(unpaid)).toBe(true);
    expect(isCashierPaidDeliveryOrder(unpaid)).toBe(false);
    expect(isCashierPaidDeliveryOrder({ ...unpaid, saldo_pendiente: '0.00', monto_pagado: '125.00' })).toBe(true);
  });

  it('una cuenta diferida no se marca pagada ni se cobra por pedido, pero puede entregarse con saldo', () => {
    const deferred = order({
      estado: 'listo', estado_pago: 'pendiente', pago_diferido: true,
      pago_pendiente: true, monto_pagado: '0.00', saldo_pendiente: '10.00',
    });
    expect(hasOutstandingCashBalance(deferred)).toBe(false);
    expect(isCashierPaidDeliveryOrder(deferred)).toBe(false);
    expect(isCashierDeferredDeliveryOrder(deferred)).toBe(true);
    expect(canConfirmCashierDelivery(deferred, 'mesa-qr')).toBe(true);
    expect(canConfirmCashierDelivery(deferred, '')).toBe(false);
  });

  it('un estado_pago pagado contradictorio no permite imprimir como pagado si el saldo es positivo', () => {
    const contradictory = order({
      estado: 'listo', estado_pago: 'pagado', pago_diferido: true,
      monto_pagado: '0.00', saldo_pendiente: '10.00',
    });
    expect(isCashierPaidDeliveryOrder(contradictory)).toBe(false);
    expect(isCashierDeferredDeliveryOrder(contradictory)).toBe(true);
  });

  it('no autoriza la entrega si el backend todavía no informó el saldo', () => {
    expect(isCashierPaidDeliveryOrder(order({ estado: 'listo', saldo_pendiente: undefined }))).toBe(false);
  });
});
