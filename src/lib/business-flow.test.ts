import { describe, expect, it } from 'vitest';
import {
  buildFlow,
  FLOW_TEMPLATES,
  flowSummary,
  matchingTemplate,
  sameSettings,
  franjasError,
  validGrace,
  type FlowSettings,
} from './business-flow';

const base: FlowSettings = {
  tipo: 'cafeteria',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  gracia_liberacion_min: 5,
  franjas_pedido: [],
};

describe('plantillas del flujo', () => {
  it('no hay plantilla de hotel (decisión de David)', () => {
    expect(FLOW_TEMPLATES.map((t) => t.label.toLowerCase()).join(' ')).not.toMatch(/hotel|playa/);
    expect(FLOW_TEMPLATES).toHaveLength(9);
  });

  it('cada plantilla usa un tipo que el backend acepta y una gracia válida', () => {
    const allowed = ['cafeteria', 'restaurante', 'padel', 'bar', 'food_truck', 'drive_thru', 'comedor', 'evento'];
    for (const template of FLOW_TEMPLATES) {
      expect(allowed).toContain(template.settings.tipo);
      expect(validGrace(template.settings.gracia_liberacion_min)).toBe(true);
    }
  });

  it('los negocios que cobran al final: restaurante, bar y pádel', () => {
    const lateTypes = FLOW_TEMPLATES.filter((t) => t.settings.permite_pago_al_final).map((t) => t.settings.tipo);
    expect(lateTypes.sort()).toEqual(['bar', 'padel', 'restaurante']);
  });

  it('reconoce la plantilla de los ajustes actuales', () => {
    expect(matchingTemplate({ ...base, tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true })?.id).toBe('padel');
    expect(matchingTemplate({ ...base, gracia_liberacion_min: 20 })).toBeNull();
    expect(sameSettings(base, { ...base })).toBe(true);
  });

  it('valida la gracia de 0 a 60', () => {
    expect([0, 5, 60].every(validGrace)).toBe(true);
    expect([-1, 61, 2.5, Number.NaN].some(validGrace)).toBe(false);
  });
});

describe('vista previa del flujo', () => {
  it('pagar al pedir: cobra, prepara, entrega y acredita el cashback', () => {
    const steps = buildFlow(base);
    expect(steps.map((s) => s.text)).toEqual([
      'Pide con su matrícula o escaneando el QR de su mesa',
      'Paga con saldo, tarjeta o efectivo al pedir',
      'Cobra si fue efectivo',
      'Prepara y marca listo',
      'En mesa entrega sin QR; para llevar valida el QR',
      'Acredita el cashback',
    ]);
    expect(flowSummary(steps)).toEqual({ works: 6, soon: 0 });
  });

  it('pagar al final: cocina prepara sin esperar el cobro y se cobra la cuenta al irse', () => {
    const text = buildFlow({ ...base, tipo: 'restaurante', entrega_requiere_qr: false, permite_pago_al_final: true }).map((s) => s.text);
    expect(text).toContain('Prepara en cuanto llega el pedido, sin esperar el cobro');
    expect(text).toContain('Entrega sin QR en mesa y para llevar');
    expect(text).toContain('Cobra la cuenta en efectivo o con la terminal, completa o dividida por pedido');
    expect(text).not.toContain('Paga con saldo, tarjeta o efectivo al pedir');
  });

  it('lo que todavía no existe sale como Próximamente; lo que ya existe, no', () => {
    const bar = buildFlow({ ...base, tipo: 'bar', permite_pago_al_final: true, entrega_requiere_qr: false });
    expect(bar.filter((s) => s.status === 'soon').map((s) => s.text)).toEqual([
      'Paga la cuenta con su saldo desde la app',
    ]);
    // La barra ya existe: las bebidas de la estación "Barra / Bebidas" no pasan por cocina.
    expect(bar.find((s) => s.role === 'Barra')).toMatchObject({ status: 'works' });
    // Cobrar con la terminal y avisar de quien se fue sin pagar ya existen.
    const texts = bar.filter((s) => s.status === 'works').map((s) => s.text);
    expect(texts).toContain('Cobra la cuenta en efectivo o con la terminal, completa o dividida por pedido');
    expect(texts).toContain('Avisa si alguien se fue sin pagar');
    const comedor = buildFlow({ ...base, tipo: 'comedor' });
    expect(comedor.filter((s) => s.status === 'soon').map((s) => s.text)).toEqual(['Descuenta de la nómina']);
    const evento = buildFlow({ ...base, tipo: 'evento' });
    expect(evento.filter((s) => s.status === 'soon').map((s) => s.text)).toEqual([
      'Prepara en el punto más cercano al asiento',
    ]);
  });

  it('drive-thru: "ya llegó" ya funciona y cocina lo ve', () => {
    const drive = buildFlow({ ...base, tipo: 'drive_thru' });
    expect(drive.find((s) => s.text === 'Avisa que ya llegó con un botón')?.status).toBe('works');
    expect(drive.some((s) => s.text.includes('ve en el pedido que ya llegó'))).toBe(true);
    expect(drive.every((s) => s.status === 'works')).toBe(true);
  });

  it('evento: el admin crea los asientos en lote', () => {
    const evento = buildFlow({ ...base, tipo: 'evento' });
    expect(evento[0]).toMatchObject({ role: 'Admin', status: 'works' });
    expect(evento[0]?.text).toContain('asientos');
  });

  it('con franjas de pedidos el flujo lo dice; sin ellas no aparece el paso', () => {
    const limited = buildFlow({ ...base, tipo: 'comedor', franjas_pedido: [{ desde: '18:00', hasta: '20:00' }, { desde: '12:00', hasta: '15:00' }] });
    expect(limited.map((s) => s.text)).toContain('Recibe pedidos solo de 12:00 a 15:00 y 18:00 a 20:00');
    expect(buildFlow({ ...base, tipo: 'comedor' }).some((s) => s.text.startsWith('Recibe pedidos solo'))).toBe(false);
  });

  it('el QR se conserva para llevar pero no se pide por pedido en una sesión de mesa', () => {
    const withQr = buildFlow({ ...base, tipo: 'padel', permite_pago_al_final: true, entrega_requiere_qr: true }).map((s) => s.text);
    const noQr = buildFlow({ ...base, tipo: 'padel', permite_pago_al_final: true, entrega_requiere_qr: false }).map((s) => s.text);
    expect(withQr).toContain('En mesa lo entrega sin QR; para llevar valida el QR');
    expect(noQr).toContain('Entrega sin QR en mesa y para llevar');
    expect(noQr).toContain('La cancha se libera al quedar saldada');
  });

  it('nunca aparece nada de hoteles', () => {
    for (const template of FLOW_TEMPLATES) {
      const text = buildFlow(template.settings).map((s) => s.text).join(' ').toLowerCase();
      expect(text).not.toMatch(/habitaci|hotel|recepci/);
    }
  });
});

describe('franjas de pedidos (mismas reglas que el backend)', () => {
  it('acepta franjas válidas y vacío', () => {
    expect(franjasError([])).toBeNull();
    expect(franjasError([{ desde: '12:00', hasta: '15:00' }, { desde: '15:00', hasta: '16:00' }])).toBeNull();
    expect(franjasError([{ desde: '22:00', hasta: '01:00' }, { desde: '02:00', hasta: '09:00' }])).toBeNull();
  });

  it.each([
    [[{ desde: '12:00', hasta: '12:00' }], /distinta/],
    [[{ desde: '22:00', hasta: '02:00' }, { desde: '01:00', hasta: '03:00' }], /empalmar/],
    [[{ desde: '', hasta: '12:00' }], /dos horas/],
    [[{ desde: '12:00', hasta: '15:00' }, { desde: '14:00', hasta: '16:00' }], /empalmar/],
    [Array.from({ length: 7 }, (_, i) => ({ desde: `0${i}:00`, hasta: `0${i}:30` })), /Máximo 6/],
  ])('rechaza %j', (franjas, mensaje) => {
    expect(franjasError(franjas)).toMatch(mensaje);
  });
});
