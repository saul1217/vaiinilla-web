import { describe, expect, it } from 'vitest';
import type { OrderDetail, SpaceSessionDetail } from '../types/api';
import { buildSpaceAccountPrintHtml } from './space-account-print';

const createDetail = (
  label: string,
  participantId: string | null,
  options: { sessionState?: 'abierta' | 'cerrada'; pedidos?: string[]; total?: number } = {},
): SpaceSessionDetail => ({
  espacio: { id: 7, nombre: 'Mesa 7', tipo: 'mesa' },
  estado: options.sessionState === 'cerrada' ? 'libre' : 'ocupada',
  saldada: false,
  fin_previsto: null,
  sesion: {
    id: 'session-1',
    estado: options.sessionState ?? 'abierta',
    inicio: '2026-10-01T18:00:00Z',
    fin_previsto: null,
    version: 1,
  },
  cuenta: {
    pedidos: [{
      id: 'order-1', folio: 30, estado: 'entregado', total: options.total ?? 140,
      pago_diferido: true, pendiente_cobro: true, items_resumen: '1× Quesadilla, 1× Hamburguesa',
      cliente: { nombre: 'Kikin' },
      creado_en: '2026-10-01T18:05:00Z',
    }],
    total: options.total ?? 140,
    pagado: 0,
    pendiente: options.total ?? 140,
    saldada: false,
    grupos: [{
      etiqueta: label,
      participante_id: participantId,
      pedidos: options.pedidos ?? ['order-1'],
      total: options.total ?? 140,
      pagado: 0,
      pendiente: options.total ?? 140,
    }],
  },
});

const orderDetail: OrderDetail = {
  id: 'order-1', folio: 30, fecha_operativa: '2026-10-01', estado: 'entregado',
  metodo_pago: 'efectivo', destino: 'en_espacio', espacio: { id: 7, nombre: 'Mesa 7', tipo: 'mesa' },
  subtotal: '140.00', ahorro_combinado: '0.00', cashback_otorgado: '0.00', total: '140.00',
  version: 1, creado_en: '2026-10-01T18:05:00Z', actualizado_en: '2026-10-01T18:05:00Z',
  notas_cocina: null, usuario: null,
  items: [
    { id: 1, producto_id: 1, nombre_producto: 'Quesadilla', estacion_preparacion: 'cocina', cantidad: 1, precio_digital_unitario: '50.00', subtotal: '50.00', opciones: [{ opcion_id: 1, nombre: 'Sin cebolla', precio_extra: '0.00' }], notas: 'Bien dorada', rechazo: null },
    { id: 2, producto_id: 2, nombre_producto: 'Hamburguesa', estacion_preparacion: 'cocina', cantidad: 1, precio_digital_unitario: '90.00', subtotal: '90.00', opciones: [], notas: null, rechazo: null },
  ],
};

const details = new Map([['order-1', orderDetail]]);

describe('impresión de cuenta de mesa', () => {
  it('imprime el alias activo y los artículos del pedido bajo el grupo oficial', () => {
    const html = buildSpaceAccountPrintHtml(createDetail('Kikin', 'participant-kikin'), 'USAGI', details);

    expect(html).toContain('<h1>USAGI</h1>');
    expect(html).toContain('KIKIN');
    expect(html).toContain('Quesadilla');
    expect(html).toContain('<span class="item-name">Hamburguesa</span><span class="quantity">1x</span><span class="amount">$90.00</span>');
    expect(html).toContain('<span>PRODUCTO</span><span>CANT.</span><span>TOTAL LÍNEA</span>');
    expect(html).toContain('Sin cebolla');
    expect(html).toContain('Bien dorada');
    expect(html).not.toContain('PEDIDO GENERAL');
    expect(html).not.toContain('VAIINILLA');
    expect(html).not.toContain('Propina');
    expect(html).not.toContain('c/u');
    expect(html).not.toContain('1x Hamburguesa');
    expect(html).not.toMatch(/<(?:button|nav|a)(?:\s|>)/i);
  });

  it('mantiene el grupo general legado cuando el backend lo entrega así', () => {
    const html = buildSpaceAccountPrintHtml(createDetail('Pedido general', null), 'USAGI', details);

    expect(html).toContain('PEDIDO GENERAL');
    expect(html).toContain('Pedido general');
  });

  it('usa la etiqueta histórica anónima y conserva los importes oficiales sin reagrupar', () => {
    const html = buildSpaceAccountPrintHtml(createDetail('Persona 1', null, { sessionState: 'cerrada', total: 140 }), 'USAGI', details);

    expect(html).toContain('PERSONA 1');
    expect(html).not.toContain('KIKIN');
    expect(html).toContain('<span>TOTAL</span><span class="amount">$140.00</span>');
    expect(html).toContain('<span>PAGADO</span><span class="amount">$0.00</span>');
    expect(html).toContain('<span>POR PAGAR</span><span class="amount">$140.00</span>');
  });

  it('excluye grupos vacíos y permite nombres/productos largos sin romper importes', () => {
    const detail = createDetail('Participante con nombre muy largo', 'p1');
    detail.cuenta!.grupos!.push({ etiqueta: 'Participante sin consumo', participante_id: 'p-empty', pedidos: [], total: 0, pagado: 0, pendiente: 0 });
    const html = buildSpaceAccountPrintHtml(detail, 'USAGI Cooperativa del Centro', details);

    expect(html).toContain('Participante con nombre muy largo');
    expect(html).not.toContain('Participante sin consumo');
    expect(html).toContain('grid-template-columns:minmax(0,1fr) 32px max-content');
    expect(html).toContain('white-space:nowrap');
    expect(html).toContain('overflow-wrap:break-word');
    expect(html).toContain('@media print');
    expect(html).toContain('@media screen and (max-width:420px)');
  });

  it('da protagonismo uniforme a los nombres de varios grupos y separa el total', () => {
    const detail = createDetail('David', 'p-david');
    detail.cuenta!.pedidos.push(
      { id: 'order-2', folio: 31, estado: 'entregado', total: 50, pago_diferido: true, pendiente_cobro: true, items_resumen: '1× Agua', cliente: { nombre: 'David' }, creado_en: '2026-10-01T18:10:00Z' },
      { id: 'order-3', folio: 32, estado: 'entregado', total: 70, pago_diferido: true, pendiente_cobro: true, items_resumen: '1× Quesadilla', cliente: { nombre: 'Flor' }, creado_en: '2026-10-01T18:12:00Z' },
    );
    detail.cuenta!.grupos = [
      { etiqueta: 'David', participante_id: 'p-david', pedidos: ['order-1', 'order-2'], total: 190, pagado: 0, pendiente: 190 },
      { etiqueta: 'Flor', participante_id: 'p-flor', pedidos: ['order-3'], total: 70, pagado: 0, pendiente: 70 },
      { etiqueta: 'Kikin', participante_id: 'p-kikin', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
    ];
    detail.cuenta!.total = 260;
    detail.cuenta!.pendiente = 260;
    const html = buildSpaceAccountPrintHtml(detail, 'USAGI', details);

    expect(html.match(/<h2>/g)).toHaveLength(2);
    expect(html.match(/DAVID/g)).toHaveLength(1);
    expect(html.match(/FLOR/g)).toHaveLength(1);
    expect(html).not.toContain('KIKIN');
    expect(html).toContain('font-size:16px;line-height:1.2;letter-spacing:.025em');
    expect(html).toContain('padding-top:14px');
    expect(html).toMatch(/Sesión · \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2} [ap]\. m\./i);
    expect(html).toContain('<span>TOTAL</span><span class="amount">$260.00</span>');
  });

  it('formatea montos grandes sin perder la alineación de precios', () => {
    const detail = createDetail('Licorería', 'p-licoreria', { total: 12450 });
    const html = buildSpaceAccountPrintHtml(detail, 'USAGI', new Map());

    expect(html).toContain('$12,450.00');
    expect(html).toContain('white-space:nowrap');
  });

  it('imprime una línea por producto con cantidad en la segunda columna e importe total de línea en la tercera', () => {
    const multipleUnits = {
      ...orderDetail,
      items: [{
        ...orderDetail.items[0]!,
        nombre_producto: 'Agua',
        cantidad: 3,
        precio_digital_unitario: '20.00',
        subtotal: '60.00',
        opciones: [{ opcion_id: 1, nombre: 'Extra fría', precio_extra: '2.00' }],
      }],
    } satisfies OrderDetail;
    const html = buildSpaceAccountPrintHtml(createDetail('David', 'p-david', { total: 60 }), 'USAGI', new Map([['order-1', multipleUnits]]));

    expect(html).toContain('<span class="item-name">Agua</span><span class="quantity">3x</span><span class="amount">$60.00</span>');
    expect(html).not.toContain('$20.00');
    expect(html).not.toContain('c/u');
    expect(html).toContain('+ Extra fría');
  });
});
