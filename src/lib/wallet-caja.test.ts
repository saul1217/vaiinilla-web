import { afterEach, describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { WALLET_CAJA_ENABLED } from './wallet-caja-feature';
import {
  MAX_CASH_RECHARGE,
  PENDING_RECHARGE_TTL_MS,
  canRecharge,
  clearAllPendingRecharges,
  clearPendingRecharge,
  exceedsCashRechargeMax,
  clientDetail,
  keepPendingAfter,
  lastOrderLabel,
  movementAmountLabel,
  movementDetail,
  pendingRechargeKey,
  readPendingRecharge,
  rechargeAmount,
  rechargeErrorMessage,
  rechargeLabel,
  searchQuery,
  writePendingRecharge,
  type PendingRecharge,
} from './wallet-caja';
import type { WalletClient, WalletClientMovement } from '../types/api';

const scope = { apiUrl: 'https://api.test/api/v1', establecimientoId: 'store-1', usuarioId: 'cajero-1', membresiaId: 'm-1' };
const record = (patch: Partial<PendingRecharge> = {}): PendingRecharge => ({
  version: 1,
  userId: 'cliente-1',
  amount: '100.00',
  idempotencyKey: '11111111-2222-4333-8444-555555555555',
  createdAt: Date.now(),
  ...patch,
});

afterEach(() => window.localStorage.clear());

describe('bandera de saldo en Caja', () => {
  it('viene apagada por defecto', () => {
    expect(WALLET_CAJA_ENABLED).toBe(false);
  });
});

describe('permisos', () => {
  it('solo el cajero recarga; admin y los demás solo consultan', () => {
    expect(canRecharge('cajero')).toBe(true);
    expect(canRecharge('admin')).toBe(false);
    expect(canRecharge('mesero')).toBe(false);
    expect(canRecharge(undefined)).toBe(false);
  });
});

describe('búsqueda', () => {
  it('busca desde 2 letras y hasta 80, recortando espacios', () => {
    expect(searchQuery(' a ')).toBeNull();
    expect(searchQuery(' an ')).toBe('an');
    expect(searchQuery('x'.repeat(81))).toBeNull();
  });

  it('distingue homónimos con identificador, correo y último pedido en el día del negocio', () => {
    const now = new Date('2026-11-10T18:00:00Z');
    const client: WalletClient = {
      usuario_id: 'c', nombre: 'Ana', identificador_cliente: 'A-12', correo_enmascarado: 'a***@ejemplo.com',
      ultimo_pedido_en: '2026-11-10T15:00:00Z', saldo: '0.00',
    };
    expect(clientDetail(client, now)).toBe('A-12 · a***@ejemplo.com · Pidió hoy');
    expect(lastOrderLabel('2026-11-09T15:00:00Z', now)).toBe('Pidió ayer');
    expect(lastOrderLabel('2026-10-28T15:00:00Z', now)).toMatch(/^Pidió el 28 oct/);
    expect(lastOrderLabel(null, now)).toBeNull();
    expect(clientDetail({ ...client, identificador_cliente: null, correo_enmascarado: null, ultimo_pedido_en: null }, now)).toBeNull();
  });
});

describe('monto', () => {
  it('acepta montos positivos con hasta 2 decimales y los manda como el servidor los pide', () => {
    expect(rechargeAmount('100')).toBe('100.00');
    expect(rechargeAmount(' 50.5 ')).toBe('50.50');
    expect(rechargeAmount('007.25')).toBe('7.25');
    expect(rechargeAmount('99999999.99')).toBe('99999999.99');
  });

  it('rechaza cero, negativos, más de 2 decimales, letras y más de 8 enteros', () => {
    for (const bad of ['', '0', '0.00', '-10', '10.555', 'diez', '1,000', '123456789']) {
      expect(rechargeAmount(bad)).toBeNull();
    }
  });

  it('el botón repite el monto', () => {
    expect(rechargeLabel(null)).toBe('Recargar en efectivo');
    expect(rechargeLabel('200.00')).toBe('Recargar $200.00 MXN en efectivo');
  });
});

describe('movimientos', () => {
  const movement = (patch: Partial<WalletClientMovement> = {}): WalletClientMovement => ({
    id: 'm', tipo: 'compra', descripcion: 'Compra con saldo', monto: '-45.00', saldo_posterior: '55.00',
    pedido_id: 'p', pedido_folio: 128, lugar: 'Mesa 4', resumen_productos: 'Café, Pan', creado_en: '2026-11-10T15:00:00Z', ...patch,
  });

  it('pone el signo que trae el servidor', () => {
    expect(movementAmountLabel('-45.00')).toBe('−$45.00 MXN');
    expect(movementAmountLabel('100.00')).toBe('+$100.00 MXN');
  });

  it('dice de qué pedido salió y nada si no viene de un pedido', () => {
    expect(movementDetail(movement())).toBe('Pedido #128 · Mesa 4 · Café, Pan');
    expect(movementDetail(movement({ pedido_folio: null, lugar: null, resumen_productos: null }))).toBeNull();
  });
});

describe('tope operativo de la recarga en efectivo', () => {
  it('acepta hasta $10000.00 y rechaza lo que pase', () => {
    expect(MAX_CASH_RECHARGE).toBe('10000.00');
    expect(exceedsCashRechargeMax('10000.00')).toBe(false);
    expect(exceedsCashRechargeMax('10000.01')).toBe(true);
    expect(exceedsCashRechargeMax('99999999.00')).toBe(true);
  });
});

describe('errores de la recarga', () => {
  const apiError = (status: number, code: string) => new VaiinillaApiError(status, { code, message: code });

  it('traduce Caja cerrada, saldo apagado y llave en proceso', () => {
    expect(rechargeErrorMessage(apiError(422, 'CASH_REGISTER_CLOSED'))).toMatch(/Abre Caja/);
    expect(rechargeErrorMessage(apiError(422, 'BALANCE_RECHARGE_NOT_ALLOWED'))).toMatch(/no tiene habilitadas/);
    expect(rechargeErrorMessage(apiError(409, 'IDEMPOTENCY_KEY_REUSED'))).toMatch(/Revisa el saldo/);
    expect(rechargeErrorMessage(new TypeError('Failed to fetch'))).toMatch(/no se cobra dos veces/);
  });

  it('conserva la llave si la recarga quedó en duda y la suelta si el servidor la rechazó', () => {
    expect(keepPendingAfter(new TypeError('Failed to fetch'))).toBe(true);
    expect(keepPendingAfter(apiError(500, 'INTERNAL'))).toBe(true);
    expect(keepPendingAfter(apiError(409, 'IDEMPOTENCY_KEY_REUSED'))).toBe(true);
    for (const status of [400, 403, 404, 422]) expect(keepPendingAfter(apiError(status, 'X'))).toBe(false);
  });
});

describe('recarga pendiente', () => {
  it('se guarda por backend, negocio, cajero y membresía, sin el nombre del cliente', () => {
    writePendingRecharge(scope, record());
    expect(pendingRechargeKey(scope)).toBe('vaiinilla:wallet-recharge:v1:https%3A%2F%2Fapi.test%2Fapi%2Fv1|store-1|cajero-1|m-1');
    expect(window.localStorage.getItem(pendingRechargeKey(scope))).not.toMatch(/Ana|userName/);
    expect(readPendingRecharge(scope)).toMatchObject({ userId: 'cliente-1', amount: '100.00' });
    expect(readPendingRecharge({ ...scope, usuarioId: 'otro-cajero' })).toBeNull();
    expect(readPendingRecharge({ ...scope, membresiaId: 'm-2' })).toBeNull();
    expect(readPendingRecharge({ ...scope, establecimientoId: 'otra-tienda' })).toBeNull();
    clearPendingRecharge(scope);
    expect(readPendingRecharge(scope)).toBeNull();
  });

  it('no devuelve el nombre aunque un registro anterior lo traiga', () => {
    window.localStorage.setItem(pendingRechargeKey(scope), JSON.stringify({ ...record(), userName: 'Ana Pérez' }));
    expect(readPendingRecharge(scope)).not.toHaveProperty('userName');
  });

  it('clearAllPendingRecharges borra las de todos los accesos y deja lo demás', () => {
    writePendingRecharge(scope, record());
    writePendingRecharge({ ...scope, establecimientoId: 'otra-tienda', membresiaId: 'm-2' }, record());
    window.localStorage.setItem('vaiinilla:admin-theme', 'dark');
    clearAllPendingRecharges();
    expect(Object.keys(window.localStorage)).toEqual(['vaiinilla:admin-theme']);
  });

  it('descarta registros viejos o dañados', () => {
    writePendingRecharge(scope, record({ createdAt: Date.now() - PENDING_RECHARGE_TTL_MS - 1 }));
    expect(readPendingRecharge(scope)).toBeNull();
    expect(window.localStorage.getItem(pendingRechargeKey(scope))).toBeNull();
    window.localStorage.setItem(pendingRechargeKey(scope), '{no es json');
    expect(readPendingRecharge(scope)).toBeNull();
    writePendingRecharge(scope, record({ idempotencyKey: 'no-uuid' }));
    expect(readPendingRecharge(scope)).toBeNull();
  });
});
