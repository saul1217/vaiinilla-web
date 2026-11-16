import { describe, expect, it } from 'vitest';
import { accountDue, ordersSignature } from './waiter-dues';
import type { SpaceSessionDetail } from '../types/api';

const detail = (cuenta: SpaceSessionDetail['cuenta']): SpaceSessionDetail => ({
  espacio: { id: 1, nombre: 'Mesa 1', tipo: 'mesa' },
  estado: 'ocupada',
  saldada: false,
  fin_previsto: null,
  sesion: null,
  cuenta,
});

describe('lo que debe cada mesa', () => {
  it('usa lo que falta después de abonos y si no hay, lo pendiente', () => {
    expect(accountDue(detail({ pedidos: [], total: 300, pendiente: 300, pagado: 0, saldada: false, abonado: 100.5, restante: 199.5 }))).toBe('199.50');
    expect(accountDue(detail({ pedidos: [], total: 80.1, pendiente: 80.1, pagado: 0, saldada: false }))).toBe('80.10');
  });

  it('sin cuenta o saldada no dice nada', () => {
    expect(accountDue(detail(null))).toBeNull();
    expect(accountDue(detail({ pedidos: [], total: 50, pendiente: 0, pagado: 50, saldada: true }))).toBeNull();
  });

  it('la firma cambia cuando un pedido avanza o se cobra', () => {
    const order = { id: 'a', estado: 'preparando', pago_pendiente: true };
    const base = [order];
    expect(ordersSignature(base)).toBe('a:preparando:1');
    expect(ordersSignature([{ ...order, estado: 'listo' }])).not.toBe(ordersSignature(base));
    expect(ordersSignature([{ ...order, pago_pendiente: false }])).not.toBe(ordersSignature(base));
  });
});
