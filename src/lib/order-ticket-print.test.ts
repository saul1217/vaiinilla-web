import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import { buildOrderTicketHtml } from './order-ticket-print';

const order: OrderDetail = {
  id: 'order-1', folio: 14, fecha_operativa: '2026-10-07', estado: 'listo', metodo_pago: 'efectivo',
  destino: 'para_llevar', espacio: null, subtotal: '125.00', ahorro_combinado: '0.00',
  cashback_otorgado: '0.00', total: '125.00', monto_pagado: '125.00', saldo_pendiente: '0.00',
  version: 3, creado_en: '2026-10-07T12:00:00.000Z', actualizado_en: '2026-10-07T12:30:00.000Z',
  notas_cocina: null, usuario: { nombre: '<Pepito>', matricula: null }, items: [{
    id: 1, producto_id: 1, nombre_producto: '<Croquetas & papas>', estacion_preparacion: 'cocina',
    cantidad: 1, precio_digital_unitario: '125.00', subtotal: '125.00',
    opciones: [{ opcion_id: 2, nombre: 'Extra "rojo"', precio_extra: '0.00' }],
  }],
};

describe('ticket individual de Caja', () => {
  it('usa el establecimiento como encabezado y los importes oficiales del backend', () => {
    const html = buildOrderTicketHtml(order, 'USAGI');
    expect(html.indexOf('<h1>USAGI</h1>')).toBeLessThan(html.indexOf('Folio #14'));
    expect(html).toContain('TOTAL</span> <span>$125.00');
    expect(html).toContain('PAGADO&nbsp;&nbsp; $125.00');
    expect(html).toContain('Método: Efectivo');
    expect(html).toContain('1× &lt;Croquetas &amp; papas&gt;');
    expect(html).not.toContain('<Pepito>');
    expect(html).not.toContain('<button');
    expect(html).toContain('@page{size:80mm auto');
  });
});
