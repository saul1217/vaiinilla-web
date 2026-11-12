import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import {
  ActionKeys,
  acceptDeadlineLabel,
  actionBody,
  actionErrorMessage,
  addDays,
  agendaRange,
  amountDue,
  buildBoard,
  cleanCode,
  dayLabel,
  homeOrderStep,
  mapsUrl,
  phoneHref,
  reasonIsValid,
  remainingCodeAttempts,
  stateLabel,
} from './reparto';
import type { HomeOrder } from '../types/api';

function homeOrder(patch: Partial<HomeOrder> = {}): HomeOrder {
  return {
    id: 'p-1', folio: 12, fecha_operativa: '2026-11-10', estado: 'cobrado', metodo_pago: 'efectivo', destino: 'a_domicilio',
    espacio: null, subtotal: '300.00', ahorro_combinado: '0.00', cashback_otorgado: '0.00', total: '340.00', version: 3,
    creado_en: '2026-11-10T15:00:00Z', actualizado_en: '2026-11-10T15:00:00Z', notas_cocina: null,
    usuario: { nombre: 'Ana Pérez', matricula: null },
    items: [{ id: 1, producto_id: 9, nombre_producto: 'Pastel', estacion_preparacion: 'cocina', cantidad: 1, precio_digital_unitario: '300.00', subtotal: '300.00', opciones: [] }],
    fecha_entrega: '2026-11-10', franja_entrega: '10:00-12:00',
    entrega: { direccion: 'Calle 5 #123', referencia: 'Portón verde', telefono: '614 123 4567', lat: null, lng: null },
    costo_envio: '40.00', anticipo: null, por_cobrar_al_entregar: '0.00', cobrado_al_entregar: null,
    ...patch,
  };
}

describe('días', () => {
  it('suma días sin depender de la zona del navegador, también al cambiar de mes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('pide 30 días atrás y 15 adelante con el día del negocio (hora de México)', () => {
    // 02:00 UTC del 11 es todavía el 10 en Ciudad de México.
    expect(agendaRange(new Date('2026-11-11T02:00:00Z'))).toEqual({ from: '2026-10-11', to: '2026-11-25', today: '2026-11-10' });
  });

  it('dice Hoy, Mañana o el día corto', () => {
    expect(dayLabel('2026-11-10', '2026-11-10')).toBe('Hoy');
    expect(dayLabel('2026-11-11', '2026-11-10')).toBe('Mañana');
    expect(dayLabel('2026-11-14', '2026-11-10')).toMatch(/^sáb 14 nov$/);
  });

  it('el plazo para contestar solo sale en un encargo por aceptar', () => {
    const now = new Date('2026-11-10T16:00:00Z');
    expect(acceptDeadlineLabel(homeOrder({ estado: 'por_aceptar', aceptar_antes_de: '2026-11-10T22:30:00Z' }), now)).toMatch(/^Contesta antes de las 4:30/);
    expect(acceptDeadlineLabel(homeOrder({ estado: 'cobrado', aceptar_antes_de: '2026-11-10T22:30:00Z' }), now)).toBeNull();
    expect(acceptDeadlineLabel(homeOrder({ estado: 'por_aceptar', aceptar_antes_de: null }), now)).toBeNull();
  });
});

describe('siguiente paso, igual que HomeOrderBoard de Android', () => {
  it.each([
    ['por_aceptar', 'a_domicilio', '0.00', 'decidir'],
    ['cobrado', 'a_domicilio', '340.00', 'mandar'],
    ['preparando', 'a_domicilio', '0.00', 'mandar'],
    ['listo', 'a_domicilio', '0.00', 'mandar'],
    ['listo', 'para_llevar', '0.00', null],
    ['en_camino', 'a_domicilio', '0.00', 'entregar'],
    ['entregado', 'a_domicilio', '340.00', 'cobrar'],
    ['entregado', 'a_domicilio', '0.00', null],
    ['por_cobrar', 'a_domicilio', '0.00', null],
    ['cancelado', 'a_domicilio', '0.00', null],
  ] as const)('%s · %s · por cobrar %s → %s', (estado, destino, due, step) => {
    expect(homeOrderStep(homeOrder({ estado, destino, por_cobrar_al_entregar: due }))).toBe(step);
  });

  it('«Cobrado» con algo por cobrar se lee «Aceptado · por cobrar»', () => {
    expect(stateLabel(homeOrder({ estado: 'cobrado', por_cobrar_al_entregar: '340.00' }))).toBe('Aceptado · por cobrar');
    expect(stateLabel(homeOrder({ estado: 'cobrado' }))).toBe('Aceptado');
    expect(stateLabel(homeOrder({ estado: 'en_camino' }))).toBe('En camino');
  });

  it('lo que falta cobrar es null si es cero o no viene', () => {
    expect(amountDue(homeOrder({ por_cobrar_al_entregar: '0.00' }))).toBeNull();
    expect(amountDue(homeOrder({ por_cobrar_al_entregar: undefined }))).toBeNull();
    expect(amountDue(homeOrder({ por_cobrar_al_entregar: '120.5' }))).toBe('120.50');
  });
});

describe('tablero', () => {
  it('arma «Por aceptar» del más viejo al nuevo, «Me deben» sin repetir y los días de hoy en adelante', () => {
    const viejo = homeOrder({ id: 'a1', estado: 'por_aceptar', creado_en: '2026-11-09T10:00:00Z', fecha_entrega: '2026-11-12' });
    const nuevo = homeOrder({ id: 'a2', estado: 'por_aceptar', creado_en: '2026-11-10T10:00:00Z', fecha_entrega: '2026-11-11' });
    const debe = homeOrder({ id: 'd1', estado: 'entregado', por_cobrar_al_entregar: '100.00', fecha_entrega: '2026-11-08' });
    const debe2 = homeOrder({ id: 'd2', estado: 'entregado', por_cobrar_al_entregar: '50.50', fecha_entrega: '2026-11-10' });
    const board = buildBoard([
      { fecha: '2026-11-08', pedidos: [debe] },
      { fecha: '2026-11-12', pedidos: [viejo] },
      { fecha: '2026-11-10', pedidos: [debe2, debe] },
      { fecha: '2026-11-11', pedidos: [nuevo] },
      { fecha: '2026-11-13', pedidos: [] },
    ], '2026-11-10');
    expect(board.awaiting.map((o) => o.id)).toEqual(['a1', 'a2']);
    expect(board.owed.map((o) => o.id)).toEqual(['d1', 'd2']);
    expect(board.owedTotal).toBe('150.50');
    expect(board.days.map((d) => d.fecha)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });
});

describe('acciones', () => {
  it('manda el cuerpo que pide cada ruta del back', () => {
    expect(actionBody({ type: 'aceptar' })).toEqual({});
    expect(actionBody({ type: 'en-camino' })).toEqual({});
    expect(actionBody({ type: 'rechazar', motivo: '  Sin harina ' })).toEqual({ motivo: 'Sin harina' });
    expect(actionBody({ type: 'entregar-domicilio', codigo: '4812' })).toEqual({ codigo: '4812' });
    expect(actionBody({ type: 'entregar-domicilio', codigo: null, entregaManual: true })).toEqual({ entrega_manual: true });
    expect(actionBody({ type: 'cobrar-entrega', metodo: 'transferencia' })).toEqual({ metodo: 'transferencia' });
    expect(actionBody({ type: 'cancelaciones', motivo: 'Se cerró', versionEsperada: 4 })).toEqual({ version_esperada: 4, motivo: 'Se cerró' });
  });

  it('el código son 4 dígitos y el motivo de 3 a 200 letras', () => {
    expect(cleanCode('48a1-29')).toBe('4812');
    expect(reasonIsValid('  ok ')).toBe(false);
    expect(reasonIsValid('Sin harina')).toBe(true);
    expect(reasonIsValid('x'.repeat(201))).toBe(false);
  });

  it('reusa la llave tras perder la respuesta y la cambia tras un rechazo del back o con otro cuerpo', () => {
    const keys = new ActionKeys();
    const action = { type: 'entregar-domicilio', codigo: '1234' } as const;
    const first = keys.keyFor('p-1', action);
    keys.settle('p-1', action, new TypeError('Failed to fetch'));
    expect(keys.keyFor('p-1', action)).toBe(first);
    keys.settle('p-1', action, new VaiinillaApiError(500, { code: 'INTERNAL', message: 'x' }));
    expect(keys.keyFor('p-1', action)).toBe(first);
    expect(keys.keyFor('p-1', { type: 'entregar-domicilio', codigo: '9999' })).not.toBe(first);
    expect(keys.keyFor('p-2', action)).not.toBe(first);
    keys.settle('p-1', action, new VaiinillaApiError(422, { code: 'INVALID_DELIVERY_CODE', message: 'x' }));
    const second = keys.keyFor('p-1', action);
    expect(second).not.toBe(first);
    keys.settle('p-1', action);
    expect(keys.keyFor('p-1', action)).not.toBe(second);
  });

  it('explica el código equivocado con los intentos que quedan y el bloqueo según el rol', () => {
    const wrong = new VaiinillaApiError(422, { code: 'INVALID_DELIVERY_CODE', message: 'x', details: [{ field: 'codigo', intentos_restantes: 2 }] });
    expect(remainingCodeAttempts(wrong)).toBe(2);
    expect(actionErrorMessage(wrong, 'cajero')).toBe('El código no coincide. Te quedan 2 intentos.');
    const locked = new VaiinillaApiError(423, { code: 'DELIVERY_CODE_LOCKED', message: 'x' });
    expect(actionErrorMessage(locked, 'cajero')).toMatch(/Un admin debe confirmar/);
    expect(actionErrorMessage(locked, 'admin')).toMatch(/sin código/);
    expect(actionErrorMessage(new TypeError('Failed to fetch'), 'admin')).toMatch(/no se repite/);
  });

  it('arma la ruta de Mapas con coordenadas o con la dirección, y el teléfono limpio', () => {
    expect(mapsUrl({ direccion: 'Calle 5 #123', referencia: null, telefono: null, lat: null, lng: null }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=Calle%205%20%23123');
    expect(mapsUrl({ direccion: 'x', referencia: null, telefono: null, lat: 28.63, lng: -106.08 }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=28.63,-106.08');
    expect(phoneHref('614 123-4567')).toBe('tel:6141234567');
    expect(phoneHref('12')).toBeNull();
  });
});
