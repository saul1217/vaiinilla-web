import { describe, expect, it } from 'vitest';
import { refundCashBlocked, suggestedRefundMethod } from './refunds';

describe('cómo se devuelve el dinero', () => {
  it('lo de tarjeta va a la terminal; efectivo, saldo o su mezcla, en efectivo', () => {
    expect(suggestedRefundMethod('terminal')).toBe('terminal');
    expect(suggestedRefundMethod('efectivo+terminal')).toBe('terminal');
    expect(suggestedRefundMethod('stripe')).toBe('terminal');
    expect(suggestedRefundMethod('saldo')).toBe('efectivo');
    expect(suggestedRefundMethod('efectivo+saldo')).toBe('efectivo');
  });

  it('con la caja cerrada no hay efectivo, salvo lo cobrado en la puerta; sin saber, no se bloquea', () => {
    expect(refundCashBlocked(false, 'efectivo')).toBe(true);
    expect(refundCashBlocked(false, 'entrega_efectivo')).toBe(false);
    expect(refundCashBlocked(true, 'efectivo')).toBe(false);
    expect(refundCashBlocked(undefined, 'efectivo')).toBe(false);
  });
});
