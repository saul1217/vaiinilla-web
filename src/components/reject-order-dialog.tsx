import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Feedback, Field, Modal } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { OrderDetail } from '../types/api';

export const MIN_REJECTION_REASON = 3;

/** Lo que se rechaza: el pedido completo o un solo artículo. */
export type RejectTarget = { kind: 'order' } | { kind: 'item'; itemId: number; name: string };

/**
 * "No se puede preparar": el personal elige qué no puede preparar (el pedido completo
 * o un artículo) y escribe el motivo. El cliente ve el motivo; si ya pagó, se le
 * devuelve esa parte.
 */
export function RejectOrderDialog({
  token,
  order,
  allowWholeOrder,
  itemFilter = () => true,
  onClose,
  onRejected,
}: {
  token: string;
  order: OrderDetail | null;
  /** Caja quita artículos; Cocina además puede rechazar el pedido completo. */
  allowWholeOrder: boolean;
  /** Qué artículos puede rechazar este rol (Cocina: solo los de su estación). */
  itemFilter?: (item: OrderDetail['items'][number]) => boolean;
  onClose: () => void;
  onRejected: (order: OrderDetail, target: RejectTarget) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<RejectTarget | null>(null);

  const activeItems = order?.items.filter((item) => !item.rechazo) ?? [];
  // El último artículo no se quita: eso es rechazar el pedido completo.
  const items = activeItems.length > 1 ? activeItems.filter(itemFilter) : [];
  const chosen: RejectTarget | null = target ?? (allowWholeOrder ? { kind: 'order' } : null);

  const reject = useMutation({
    mutationFn: async ({ current, scope, motivo }: { current: OrderDetail; scope: RejectTarget; motivo: string }) => {
      if (scope.kind === 'order') await api.rejectOrder(token, current.id, current.version, motivo);
      else await api.rejectOrderItem(token, current.id, scope.itemId, current.version, motivo);
    },
    onSuccess: async (_, { current, scope }) => {
      setReason('');
      setTarget(null);
      await onRejected(current, scope);
    },
  });

  function close() {
    reject.reset();
    setReason('');
    setTarget(null);
    onClose();
  }

  const isItem = chosen?.kind === 'item';
  return (
    <Modal
      open={Boolean(order)}
      onOpenChange={(open) => { if (!open) close(); }}
      title={order ? `No se puede preparar · pedido ${order.folio}` : 'No se puede preparar'}
      description="El cliente verá este motivo y se le devolverá lo que ya pagó."
    >
      {order && (
        <form
          className="transaction-form"
          onSubmit={(event) => {
            event.preventDefault();
            const motivo = reason.trim();
            if (chosen && motivo.length >= MIN_REJECTION_REASON) reject.mutate({ current: order, scope: chosen, motivo });
          }}
        >
          {reject.isError && <Feedback tone="error">{errorMessage(reject.error)}</Feedback>}
          <fieldset className="reject-scope">
            <legend className="field__label">¿Qué no se puede preparar?</legend>
            {allowWholeOrder && (
              <label className="reject-scope__option">
                <input
                  type="radio"
                  name="reject-scope"
                  checked={chosen?.kind === 'order'}
                  onChange={() => setTarget({ kind: 'order' })}
                />
                <span>Todo el pedido</span>
              </label>
            )}
            {items.map((item) => (
              <label key={item.id} className="reject-scope__option">
                <input
                  type="radio"
                  name="reject-scope"
                  checked={chosen?.kind === 'item' && chosen.itemId === item.id}
                  onChange={() => setTarget({ kind: 'item', itemId: item.id, name: item.nombre_producto })}
                />
                <span>
                  {item.cantidad}× {item.nombre_producto}
                </span>
              </label>
            ))}
            {!allowWholeOrder && items.length === 0 && (
              <p className="field__hint">Este pedido solo tiene un artículo: para quitarlo hay que cancelar el pedido completo.</p>
            )}
          </fieldset>
          <Field
            name="rejection-reason"
            label="Motivo"
            placeholder="Se terminó el producto"
            maxLength={240}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint={`Mínimo ${MIN_REJECTION_REASON} letras.`}
          />
          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
            <Button
              type="submit"
              variant="danger"
              loading={reject.isPending}
              disabled={!chosen || reason.trim().length < MIN_REJECTION_REASON}
            >
              {isItem ? 'Quitar artículo' : 'Rechazar pedido'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
