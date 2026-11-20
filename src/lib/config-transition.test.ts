import { describe, expect, it } from 'vitest';
import { transitionBlockedMessage } from './config-transition';

describe('transitionBlockedMessage', () => {
  it('permitido: nada que decir', () => {
    expect(transitionBlockedMessage({ permitido: true })).toBeNull();
  });

  it('dice qué está abierto y cuántos', () => {
    const msg = transitionBlockedMessage({
      permitido: false,
      reason_codes: ['OPERATIONS_IN_FLIGHT'],
      bloqueos: [
        { code: 'OPEN_TABLES', count: 2, blocking: true, message: 'Hay mesas o sesiones de espacio abiertas.' },
        { code: 'OPEN_CASH_SESSION', count: 1, blocking: true, message: 'Hay una sesión de caja abierta.' },
      ],
    });
    expect(msg).toBe(
      'No se puede cambiar ahora. Hay mesas o sesiones de espacio abiertas. (2) · Hay una sesión de caja abierta. Ciérralas y vuelve a intentarlo.',
    );
  });

  it('traduce los motivos del contrato', () => {
    expect(transitionBlockedMessage({ permitido: false, reason_codes: ['HOTEL_TYPE_LOCKED'] })).toContain('Un hotel');
  });
});
