import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  DurableStorageError,
  OfflineStaffQueue,
  RETRY_INTERVAL_MS,
  STORAGE_UNAVAILABLE_MESSAGE,
  browserDurableStore,
  pendingOf,
  problemsOf,
  scopeId,
  type DurableStore,
  type EnqueueInput,
  type FlushEvent,
  type OfflineStaffOrder,
  type OfflineStaffScope,
} from '../lib/offline-staff-orders';

export interface OfflineStaffOrdersState {
  pending: OfflineStaffOrder[];
  problems: OfflineStaffOrder[];
  sending: boolean;
  /** El almacenamiento durable falló: no se pueden tomar pedidos sin internet aquí. */
  storageError: string | null;
}

export interface OfflineStaffOrdersApi extends OfflineStaffOrdersState {
  enabled: boolean;
  scope: OfflineStaffScope | null;
  store: DurableStore;
  /** Guarda el pedido. Lanza DurableStorageError si no quedó guardado: quien llama debe avisar. */
  enqueue: (entry: EnqueueInput) => OfflineStaffOrder;
  retry: (id?: string) => void;
  resolve: (id: string) => void;
  flushNow: () => void;
}

const EMPTY: OfflineStaffOrdersState = { pending: [], problems: [], sending: false, storageError: null };

interface Options {
  enabled: boolean;
  token: string;
  scope: OfflineStaffScope | null;
  onEvent?: (event: FlushEvent) => void;
  store?: DurableStore;
}

/**
 * Cola de pedidos sin conexión de la sesión abierta. Se manda al montar, al volver la red
 * (evento `online`) y cada 30 s mientras haya pendientes. Si cambia la sesión (otro negocio,
 * otro usuario u otro backend) deja de mandar la cola anterior y carga la nueva.
 */
export function useOfflineStaffOrders({ enabled, token, scope, onEvent, store: injected }: Options): OfflineStaffOrdersApi {
  const store = useMemo(() => injected ?? browserDurableStore(), [injected]);
  const key = enabled && scope ? scopeId(scope) : null;
  const queue = useMemo(
    () => (key && scope ? new OfflineStaffQueue(store, scope) : null),
    // La cola depende solo de la llave de alcance, no de la identidad del objeto scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, store],
  );
  const [state, setState] = useState<OfflineStaffOrdersState>(EMPTY);
  const tokenRef = useRef(token);
  const currentKey = useRef(key);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    tokenRef.current = token;
    onEventRef.current = onEvent;
  });

  const refresh = useCallback(() => {
    if (!queue) {
      setState(EMPTY);
      return;
    }
    try {
      const snapshot = queue.snapshot();
      setState((previous) => ({ ...previous, pending: pendingOf(snapshot), problems: problemsOf(snapshot), storageError: null }));
    } catch (error) {
      const message = error instanceof DurableStorageError ? error.message : STORAGE_UNAVAILABLE_MESSAGE;
      setState((previous) => ({ ...previous, storageError: message }));
    }
  }, [queue]);

  const flushNow = useCallback(() => {
    if (!queue || !key) return;
    const flushKey = key;
    const isCurrent = () => currentKey.current === flushKey;
    setState((previous) => ({ ...previous, sending: true }));
    void queue
      .flush((body, idempotencyKey) => api.createStaffOrder(tokenRef.current, body, idempotencyKey), isCurrent)
      .then((result) => {
        if (!isCurrent()) return;
        result.events.forEach((event) => onEventRef.current?.(event));
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        const message = error instanceof DurableStorageError ? error.message : STORAGE_UNAVAILABLE_MESSAGE;
        setState((previous) => ({ ...previous, storageError: message }));
      })
      .finally(() => {
        if (!isCurrent()) return;
        setState((previous) => ({ ...previous, sending: false }));
        refresh();
      });
  }, [queue, key, refresh]);

  useEffect(() => {
    currentKey.current = key;
    setState(EMPTY);
    if (!queue) return undefined;
    refresh();
    flushNow();
    const onOnline = () => flushNow();
    // Otra pestaña de la misma sesión cambió la cola: se vuelve a leer.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.includes(key ?? '\u0000')) refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
      if (currentKey.current === key) currentKey.current = null;
    };
  }, [queue, key, refresh, flushNow]);

  // La red puede estar bien y el servidor caído: mientras haya pendientes, cada 30 s.
  const hasPending = state.pending.length > 0;
  useEffect(() => {
    if (!queue || !hasPending) return undefined;
    const timer = window.setInterval(flushNow, RETRY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [queue, hasPending, flushNow]);

  const enqueue = useCallback(
    (entry: EnqueueInput) => {
      if (!queue) throw new Error('La operación sin internet no está disponible en esta sesión.');
      try {
        const order = queue.enqueue(entry);
        refresh();
        return order;
      } catch (error) {
        if (error instanceof DurableStorageError) setState((previous) => ({ ...previous, storageError: error.message }));
        throw error;
      }
    },
    [queue, refresh],
  );

  const guard = useCallback(
    (action: () => void) => {
      try {
        action();
      } catch (error) {
        const message = error instanceof DurableStorageError ? error.message : STORAGE_UNAVAILABLE_MESSAGE;
        setState((previous) => ({ ...previous, storageError: message }));
      }
      refresh();
    },
    [refresh],
  );

  const retry = useCallback(
    (id?: string) => {
      if (!queue) return;
      guard(() => queue.retry(id));
      flushNow();
    },
    [queue, guard, flushNow],
  );

  const resolve = useCallback((id: string) => {
    if (!queue) return;
    guard(() => queue.resolve(id));
  }, [queue, guard]);

  return { ...state, enabled: Boolean(queue), scope: queue ? scope : null, store, enqueue, retry, resolve, flushNow };
}
