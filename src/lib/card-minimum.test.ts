import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { cardAllowedForCharge, cardMinimumDetails, cardMinimumErrorText, cardMinimumNotice } from './card-minimum';

describe('mínimo por cobro con tarjeta (cafeterías)', () => {
  it('es estricto: $30.00 no alcanza y $30.01 sí', () => {
    expect(cardAllowedForCharge('30.00', '30.00')).toBe(false);
    expect(cardAllowedForCharge('29.99', '30.00')).toBe(false);
    expect(cardAllowedForCharge('30.01', '30.00')).toBe(true);
    expect(cardAllowedForCharge('30', '30.00')).toBe(false);
  });

  it('compara en centavos, sin errores de punto flotante', () => {
    // 0.1 + 0.2 en flotante no es 0.3; en centavos sí.
    expect(cardAllowedForCharge('0.30', '0.29')).toBe(true);
    expect(cardAllowedForCharge('45.10', '45.1')).toBe(false);
  });

  it('respeta el mínimo configurado por el negocio', () => {
    expect(cardAllowedForCharge('50.00', '50.00')).toBe(false);
    expect(cardAllowedForCharge('50.01', '50.00')).toBe(true);
  });

  it('sin mínimo (null, o un back anterior que no lo manda) no bloquea', () => {
    expect(cardAllowedForCharge('5.00', null)).toBe(true);
    expect(cardAllowedForCharge('5.00', undefined)).toBe(true);
    expect(cardMinimumNotice(null)).toBeNull();
    expect(cardMinimumNotice(undefined)).toBeNull();
  });

  it('un mínimo o un monto que no se entiende no bloquea: decide el servidor', () => {
    expect(cardAllowedForCharge('10.00', 'abc')).toBe(true);
    expect(cardAllowedForCharge('', '30.00')).toBe(true);
  });

  it('en un cobro dividido se mide cada tramo, no el total', () => {
    const tramos = ['45.00', '30.00', '30.01'];
    expect(tramos.map((monto) => cardAllowedForCharge(monto, '30.00'))).toEqual([true, false, true]);
  });

  it('el aviso usa el mínimo que publica el back', () => {
    expect(cardMinimumNotice('30.00')).toBe(
      'Para pagar con tarjeta, el cobro debe ser mayor a $30.00 MXN. Puedes elegir efectivo en caja.',
    );
    expect(cardMinimumNotice('45.50', false)).toBe('Para pagar con tarjeta, el cobro debe ser mayor a $45.50 MXN.');
  });

  it('lee los detalles del 422 en arreglo (como los manda el back) o como objeto', () => {
    expect(cardMinimumDetails([{ minimo: '30.00', monto: '25.00', efectivo_disponible: false }])).toEqual({
      minimo: '30.00',
      efectivo_disponible: false,
    });
    expect(cardMinimumDetails({ minimo: '30.00' })).toEqual({ minimo: '30.00', efectivo_disponible: true });
    expect(cardMinimumDetails(undefined)).toBeNull();
    expect(cardMinimumDetails([{ monto: '25.00' }])).toBeNull();
  });

  it('el texto del 422 cambia según haya efectivo en caja', () => {
    expect(cardMinimumErrorText([{ minimo: '30.00', monto: '30.00', efectivo_disponible: true }])).toBe(
      'El cobro con tarjeta debe ser mayor a $30.00 MXN. Elige efectivo en caja o agrega productos.',
    );
    expect(cardMinimumErrorText([{ minimo: '30.00', monto: '30.00', efectivo_disponible: false }])).toBe(
      'El cobro con tarjeta debe ser mayor a $30.00 MXN. Agrega productos para continuar.',
    );
  });

  it('VaiinillaApiError con CARD_MIN_AMOUNT da el texto por código; sin detalles usa el del back', () => {
    const conDetalles = new VaiinillaApiError(422, {
      code: 'CARD_MIN_AMOUNT',
      message: 'Para pagar con tarjeta el cobro debe ser mayor a $30.00 MXN. Puedes pagar en efectivo en caja.',
      details: [{ minimo: '30.00', monto: '12.00', efectivo_disponible: false }],
    });
    expect(conDetalles.code).toBe('CARD_MIN_AMOUNT');
    expect(conDetalles.message).toBe('El cobro con tarjeta debe ser mayor a $30.00 MXN. Agrega productos para continuar.');

    const sinDetalles = new VaiinillaApiError(422, { code: 'CARD_MIN_AMOUNT', message: 'Mensaje del back.' });
    expect(sinDetalles.message).toBe('Mensaje del back.');
  });
});
