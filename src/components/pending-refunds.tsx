// Devoluciones pendientes: dinero que el negocio debe regresar a mano (lo abonado de
// más a una cuenta, o algo quitado que ya se había pagado con terminal, saldo o mezcla).
// Caja confirma cuándo y cómo lo devolvió; en efectivo sale del cajón.
// Contrato: vaiinilla_back docs/devoluciones.md.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { Button, Feedback, Field } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';
import { refundCashBlocked, suggestedRefundMethod } from '../lib/refunds';
import type { PendingRefund, RefundMethod } from '../types/api';

const ORIGIN_LABEL: Record<PendingRefund['origen'], string> = {
  sobrante_cuenta: 'Se abonó de más a la cuenta',
  rechazo_articulo: 'Se quitó un artículo ya pagado',
  cancelacion: 'Se canceló un pedido ya pagado',
  reserva_cancelada: 'Se canceló una reserva ya pagada',
};

function methodLabel(method: string): string {
  return method.replace('+', ' y ');
}

export function PendingRefunds({
  token,
  spaceId,
  canConfirm,
}: {
  token: string;
  /** Solo las de este espacio; sin él, todas las del negocio. */
  spaceId?: number;
  /** Solo Caja confirma; los demás solo las ven. */
  canConfirm: boolean;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // La devolución con «Otro» pide escribir cómo se devolvió.
  const [other, setOther] = useState<{ id: string; note: string } | null>(null);
  const refunds = useQuery({
    queryKey: ['pending-refunds', spaceId ?? 'all'],
    enabled: Boolean(token),
    queryFn: () => api.pendingRefunds(token, spaceId),
    refetchInterval: 10_000,
  });
  const list = refunds.data ?? [];
  const status = useQuery({
    queryKey: ['operational-status', 'refunds'],
    enabled: Boolean(token) && canConfirm && list.length > 0,
    queryFn: () => api.operationalStatus(token),
    staleTime: 15_000,
  });
  const cashOpen = status.data?.sesion_caja_abierta;
  const confirm = useMutation({
    mutationFn: ({ refund, method, note }: { refund: PendingRefund; method: RefundMethod; note?: string }) =>
      note ? api.confirmRefund(token, refund.id, method, note) : api.confirmRefund(token, refund.id, method),
    onSuccess: async (done) => {
      setOther(null);
      setNotice({ tone: 'success', text: `Devolución de ${formatMoney(done.monto)} confirmada.` });
      await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    },
    onError: async (error) => {
      setNotice({ tone: 'error', text: errorMessage(error) });
      await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    },
  });

  if (list.length === 0 && !notice) return null;

  return (
    <section className="pending-refunds" aria-label="Devoluciones pendientes">
      {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
      {list.map((refund) => {
        const original = refund.metodo_original;
        const suggested = suggestedRefundMethod(original);
        const cashBlocked = refundCashBlocked(cashOpen, original);
        const busy = confirm.isPending && confirm.variables?.refund.id === refund.id;
        const writing = other?.id === refund.id ? other : null;
        return (
          <article key={refund.id} className="pending-refund" role="alert">
            <HandCoins aria-hidden="true" />
            <div>
              <strong>Devolver {formatMoney(refund.monto)}</strong>
              <p>
                {ORIGIN_LABEL[refund.origen] ?? 'Dinero por devolver'} · se pagó con {methodLabel(original)}
              </p>
            </div>
            {canConfirm && (
              <div className="pending-refund__actions">
                {!(suggested === 'efectivo' && cashBlocked) && (
                  <Button
                    variant="dark"
                    loading={busy && confirm.variables?.method === suggested}
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate({ refund, method: suggested })}
                  >
                    Devuelto en {suggested}
                  </Button>
                )}
                {suggested !== 'efectivo' && !cashBlocked && (
                  <Button
                    variant="secondary"
                    loading={busy && confirm.variables?.method === 'efectivo'}
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate({ refund, method: 'efectivo' })}
                  >
                    En efectivo
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={confirm.isPending}
                  aria-expanded={Boolean(writing)}
                  onClick={() => setOther(writing ? null : { id: refund.id, note: '' })}
                >
                  Otro
                </Button>
                {cashBlocked && <p className="pending-refund__hint">La caja está cerrada: ábrela para devolver efectivo.</p>}
                {writing && (
                  <form
                    className="pending-refund__other"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (writing.note.trim()) confirm.mutate({ refund, method: 'otro', note: writing.note.trim() });
                    }}
                  >
                    <Field
                      name={`refund-note-${refund.id}`}
                      label="¿Cómo se devolvió?"
                      placeholder="Por ejemplo: transferencia a su cuenta"
                      maxLength={200}
                      value={writing.note}
                      onChange={(event) => setOther({ id: refund.id, note: event.target.value })}
                    />
                    <Button type="submit" variant="dark" loading={busy && confirm.variables?.method === 'otro'} disabled={!writing.note.trim() || confirm.isPending}>
                      Confirmar devolución
                    </Button>
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
