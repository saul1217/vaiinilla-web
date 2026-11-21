import { describe, expect, it } from 'vitest';
import { parseAccountingReport, parseDayCut, parseShiftCut } from './cortes-reporte';

// Respuestas reales de Railway development (16 nov 2026, negocio de pruebas), con nombres e ids anonimizados.
const efectivo = {
  fondo: '500.00', cobros_efectivo: '6075.00', propinas: '0.00', recargas: '0.00', entradas: '0.00', salidas: '0.00',
  devoluciones_efectivo: '3780.00', efectivo_esperado: '2795.00', contado: null, diferencia: null, arqueo: null,
};
const turno = {
  id: '00000000-0000-4000-8000-000000000001', fecha_operativa: '2026-11-12', abierta_en: '2026-11-12T21:13:40.563Z',
  cerrada_en: null, cierre_automatico: false, abierta_por: { usuario_id: 'u-caja', nombre: 'Caja Prueba' }, cerrada_por: null, efectivo,
};
const desglose = {
  resumen: { envios: '0.00', rentas: '0.00', ventas: '2295.00', pedidos: 18, articulos: 27, descuentos: '0.00', ticket_promedio: '127.50', importe_articulos: '2295.00' },
  propinas: { total: '0.00', efectivo: '0.00', terminal: '0.00' },
  cancelados: { monto: '9940.00', pedidos: 110 },
  formas_pago: [{ monto: '2295.00', metodo: 'efectivo', pedidos: 18 }],
  por_espacio: [{ tipo: null, nombre: null, rentas: '0.00', ventas: '2295.00', consumo: '2295.00', pedidos: 18, espacio_id: null }],
  devoluciones: { reembolsos_reserva: '0.00', articulos_rechazados: '0.00', devoluciones_entregadas: '0.00' },
  por_personal: [{ rol: 'cajero', nombre: 'Caja Prueba', ventas: '2295.00', pedidos: 18, usuario_id: 'u-caja', ticket_promedio: '127.50' }],
  por_producto: [
    { importe: '1710.00', cantidad: 18, producto: 'Quesabirrias', categoria: 'Antojitos', producto_id: 2068 },
    { importe: '585.00', cantidad: 9, producto: 'Churros con chocolate', categoria: 'Postres', producto_id: 2063 },
  ],
  por_categoria: [
    { importe: '1710.00', cantidad: 18, categoria: 'Antojitos', categoria_id: 2017 },
    { importe: '585.00', cantidad: 9, categoria: 'Postres', categoria_id: 2024 },
  ],
};

describe('cortes con respuestas reales del servidor', () => {
  it('lee el corte del día con su turno abierto, el efectivo y el desglose', () => {
    const day = parseDayCut({ fecha: '2026-11-12', tipo: 'parcial', turnos: [turno], efectivo, ...desglose, sin_turno: { ventas: '0.00', pedidos: 0 }, generado_en: '2026-11-16T19:12:13.500Z' });
    expect(day.final).toBe(false);
    expect(day.turnos).toHaveLength(1);
    expect(day.turnos[0]).toMatchObject({ fecha: '2026-11-12', cerradaEn: null, abiertaPor: 'Caja Prueba' });
    expect(day.efectivo).toMatchObject({ fondo: '500.00', cobrosEfectivo: '6075.00', devoluciones: '3780.00', esperado: '2795.00', contado: null, arqueo: null });
    expect(day.desglose.resumen).toMatchObject({ ventas: '2295.00', pedidos: 18, ticketPromedio: '127.50' });
    expect(day.desglose.cancelados).toEqual({ pedidos: 110, monto: '9940.00' });
    expect(day.desglose.porProducto.map((p) => p.producto)).toEqual(['Quesabirrias', 'Churros con chocolate']);
    expect(day.desglose.porEspacio[0]).toMatchObject({ espacioId: null, nombre: null, pedidos: 18 });
  });

  it('lee el corte de un turno', () => {
    const cut = parseShiftCut({ tipo: 'parcial', turno, ...desglose, generado_en: '2026-11-16T19:12:27.266Z' });
    expect(cut.final).toBe(false);
    expect(cut.turno.efectivo.esperado).toBe('2795.00');
    expect(cut.desglose.porPersonal[0]).toMatchObject({ nombre: 'Caja Prueba', rol: 'cajero', ticketPromedio: '127.50' });
  });

  it('lee el reporte contable por periodo, con sus días y formas de pago', () => {
    const report = parseAccountingReport({
      ...desglose,
      negocio: 'Negocio de pruebas',
      periodo: { desde: '2026-11-01', hasta: '2026-11-16', dias: 16 },
      por_dia: [{ fecha: '2026-11-01', ventas: '586.00', pedidos: 5 }, { fecha: '2026-11-02', ventas: '1010.00', pedidos: 10 }],
      formas_pago: [{ monto: '14251.00', metodo: 'efectivo', pedidos: 101 }, { monto: '350.00', metodo: 'terminal', pedidos: 3 }, { monto: '45.00', metodo: 'saldo', pedidos: 1 }],
      propinas: { total: '210.75', efectivo: '180.00', terminal: '30.75' },
      sin_turno: null,
    });
    expect(report).toMatchObject({ negocio: 'Negocio de pruebas', desde: '2026-11-01', hasta: '2026-11-16' });
    expect(report.desglose.porDia).toHaveLength(2);
    expect(report.desglose.formasPago.map((f) => f.metodo)).toEqual(['efectivo', 'terminal', 'saldo']);
    expect(report.desglose.propinas).toEqual({ total: '210.75', efectivo: '180.00', terminal: '30.75' });
  });
});
