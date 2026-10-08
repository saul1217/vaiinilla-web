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
    expect(html).toContain('<span>TOTAL</span><span class="amount">$125.00</span>');
    expect(html).toContain('<span>PAGADO</span><span class="amount">$125.00</span>');
    expect(html).toContain('Método: Efectivo');
    expect(html).toContain('class="customer">&lt;PEPITO&gt;');
    expect(html).toContain('class="product-name">1x &lt;Croquetas &amp; papas&gt;');
    expect(html).toMatch(/class="timestamp">\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2} [ap]\. m\./i);
    expect(html).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(html).toContain('font-size:16px;line-height:1.25;font-weight:800');
    expect(html).toContain('margin-top:20px;padding-top:12px');
    expect(html).not.toContain('<Pepito>');
    expect(html).not.toContain('<button');
    expect(html).toContain('@page{size:80mm auto');
  });

  it('mantiene legibles los importes grandes y traduce otros métodos de pago', () => {
    const large = {
      ...order,
      metodo_pago: 'stripe' as const,
      total: '12450.00',
      monto_pagado: '12450.00',
      items: [{ ...order.items[0]!, subtotal: '12450.00', cantidad: 20, nombre_producto: 'Hamburguesa especial de la casa con queso y tocino' }],
    };
    const html = buildOrderTicketHtml(large, 'USAGI');

    expect(html).toContain('20x Hamburguesa especial de la casa con queso y tocino');
    expect(html).toContain('$12,450.00');
    expect(html).toContain('Método: Tarjeta');
    expect(html).not.toMatch(/word-break:\s*break-all/);
  });
});
