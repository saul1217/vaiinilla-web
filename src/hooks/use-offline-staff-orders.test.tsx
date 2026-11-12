import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import { OfflineStaffQueue, browserDurableStore, pendingOf, type OfflineStaffScope } from '../lib/offline-staff-orders';
import type { StaffOrderInput } from '../types/api';
import { useOfflineStaffOrders } from './use-offline-staff-orders';

const apiMock = vi.hoisted(() => ({ createStaffOrder: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

const A: OfflineStaffScope = { env: 'api.test', establecimientoId: 'est-1', usuarioId: 'user-1' };
const B: OfflineStaffScope = { env: 'api.test', establecimientoId: 'est-1', usuarioId: 'user-2' };
const PEDIDO: StaffOrderInput = { metodo_pago: 'efectivo', destino: 'para_llevar', espacio_id: null, items: [{ producto_id: 1, cantidad: 1, opcion_ids: [] }] };
const sinRed = () => new VaiinillaApiError(0, { code: 'BACKEND_UNAVAILABLE', message: 'Sin conexión' });

function seed(scope: OfflineStaffScope, key: string) {
  return new OfflineStaffQueue(browserDurableStore(window.localStorage), scope).enqueue({
    input: PEDIDO, idempotencyKey: key, roleInitial: 'M', placeLabel: 'Para llevar', summary: '1× Taco',
  });
}

describe('useOfflineStaffOrders', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('con el flag apagado no lee ni manda nada', () => {
    seed(A, 'a-1');
    const { result } = renderHook(() => useOfflineStaffOrders({ enabled: false, token: 't', scope: A }));
    expect(result.current.enabled).toBe(false);
    expect(result.current.pending).toHaveLength(0);
    expect(apiMock.createStaffOrder).not.toHaveBeenCalled();
  });

  it('reconexión: al volver la red (evento online) manda lo guardado con el token vigente', async () => {
    seed(A, 'a-1');
    apiMock.createStaffOrder.mockRejectedValueOnce(sinRed()).mockResolvedValue({ id: 'x', folio: 9 });
    const onEvent = vi.fn();
    const { result, rerender } = renderHook(
      ({ token }) => useOfflineStaffOrders({ enabled: true, token, scope: A, onEvent }),
      { initialProps: { token: 'token-1' } },
    );
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sending).toBe(false));
    expect(result.current.pending).toHaveLength(1);

    // El token se renovó mientras no había red: se usa el nuevo, nunca uno guardado.
    rerender({ token: 'token-2' });
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    expect(apiMock.createStaffOrder).toHaveBeenLastCalledWith('token-2', expect.anything(), 'a-1');
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'sent', folio: 9 }));
  });

  it('cambio de sesión: muestra la cola de la nueva y no manda la anterior con el token nuevo', async () => {
    seed(A, 'a-1');
    seed(B, 'b-1');
    apiMock.createStaffOrder.mockRejectedValue(sinRed());
    const { result, rerender } = renderHook(
      ({ scope, token }) => useOfflineStaffOrders({ enabled: true, token, scope }),
      { initialProps: { scope: A, token: 'token-a' } },
    );
    await waitFor(() => expect(result.current.pending.map((o) => o.idempotencyKey)).toEqual(['a-1']));
    apiMock.createStaffOrder.mockClear();
    rerender({ scope: B, token: 'token-b' });
    await waitFor(() => expect(result.current.pending.map((o) => o.idempotencyKey)).toEqual(['b-1']));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalled());
    for (const [token, , key] of apiMock.createStaffOrder.mock.calls as [string, unknown, string][]) {
      expect(token === 'token-b' && key === 'b-1').toBe(true);
    }
    // La cola de A sigue guardada para cuando vuelva esa sesión.
    expect(pendingOf(new OfflineStaffQueue(browserDurableStore(window.localStorage), A).snapshot())).toHaveLength(1);
  });

  it('almacenamiento roto: lo dice en storageError y enqueue lanza', () => {
    const store = browserDurableStore({
      getItem: () => null,
      setItem: () => { throw new DOMException('QuotaExceededError'); },
      removeItem: () => undefined,
    } as unknown as Storage);
    const { result } = renderHook(() => useOfflineStaffOrders({ enabled: true, token: 't', scope: A, store }));
    expect(() => result.current.enqueue({ input: PEDIDO, idempotencyKey: 'k', roleInitial: 'C', placeLabel: 'x', summary: 'y' })).toThrow();
    return waitFor(() => expect(result.current.storageError).toMatch(/no deja guardar/));
  });
});
