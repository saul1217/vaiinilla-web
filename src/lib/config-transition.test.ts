import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { splitTransition, TRANSITION_FIELDS, transitionBlockDetails } from './config-transition';

describe('config-transition', () => {
  it('los campos de transición son los mismos siete del backend', () => {
    expect([...TRANSITION_FIELDS]).toEqual([
      'tipo',
      'entrega_en_espacio',
      'entrega_requiere_qr',
      'permite_pago_al_final',
      'barra_prepara',
      'permite_pago_en_caja',
      'cocina_prepara_sin_cobrar',
    ]);
  });

  it('separa los cuatro campos del flujo como transición y deja lo demás para el PATCH', () => {
    const { transition, ordinary } = splitTransition({
      tipo: 'padel',
      entrega_requiere_qr: false,
      permite_pago_al_final: true,
      entrega_en_espacio: 'ambas',
      gracia_liberacion_min: 5,
      franjas_pedido: [],
    });
    expect(transition).toEqual({ tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true, entrega_en_espacio: 'ambas' });
    expect(ordinary).toEqual({ gracia_liberacion_min: 5, franjas_pedido: [] });
  });

  it('con lo guardado, un campo de transición sin cambio no abre transición ni viaja en el PATCH', () => {
    const { transition, ordinary } = splitTransition(
      { tipo: 'cafeteria', entrega_requiere_qr: true, gracia_liberacion_min: 7 },
      { tipo: 'cafeteria', entrega_requiere_qr: true },
    );
    expect(transition).toBeNull();
    expect(ordinary).toEqual({ gracia_liberacion_min: 7 });
  });

  it('lee el detalle del 409 CONFIG_TRANSITION_BLOCKED y descarta otros errores', () => {
    const error = new VaiinillaApiError(409, {
      code: 'CONFIG_TRANSITION_BLOCKED',
      message: 'bloqueada',
      details: [{ reason_codes: ['OPERATIONS_IN_FLIGHT'], bloqueos: [], operaciones: { items: [{ code: 'OPEN_ORDERS', id: '1', referencia: '7', estado: 'nuevo', desde: null, panel: 'pedidos' }], total: 4 }, version_actual: 2 }],
    });
    expect(transitionBlockDetails(error)).toMatchObject({ reason_codes: ['OPERATIONS_IN_FLIGHT'], total: 4, version_actual: 2 });
    expect(transitionBlockDetails(error)?.operaciones).toHaveLength(1);
    expect(transitionBlockDetails(new VaiinillaApiError(409, { code: 'CONFIG_VERSION_CONFLICT', message: 'v' }))).toBeNull();
    expect(transitionBlockDetails(new Error('x'))).toBeNull();
  });
});
