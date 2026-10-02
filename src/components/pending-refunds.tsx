// Devoluciones pendientes: dinero que el negocio debe regresar a mano (lo abonado de
// más a una cuenta, o algo quitado que ya se había pagado con terminal, saldo o mezcla).
// Caja confirma cuándo y cómo lo devolvió; en efectivo sale del cajón.
// Contrato: vaiinilla_back docs/devoluciones.md.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { Button, Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';
import type { PendingRefund, RefundMethod } from '../types/api';

const ORIGIN_LABEL: Record<PendingRefund['origen'], string> = {
  sobrante_cuenta: 'Se abonó de más a la cuenta',
  rechazo_articulo: 'Se quitó un artículo ya pagado',
  cancelacion: 'Se canceló un pedido ya pagado',
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
  const refunds = useQuery({
    queryKey: ['pending-refunds', spaceId ?? 'all'],
    enabled: Boolean(token),
    queryFn: () => api.pendingRefunds(token, spaceId),
    refetchInterval: 10_000,
  });
  const confirm = useMutation({
    mutationFn: ({ refund, method }: { refund: PendingRefund; method: RefundMethod }) =>
      api.confirmRefund(token, refund.id, method),
    onSuccess: async (done) => {
      setNotice({ tone: 'success', text: `Devolución de ${formatMoney(done.monto)} confirmada.` });
      await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    },
    onError: async (error) => {
      setNotice({ tone: 'error', text: errorMessage(error) });
      await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    },
  });

  const list = refunds.data ?? [];
  if (list.length === 0 && !notice) return null;

  return (
    <section className="pending-refunds" aria-label="Devoluciones pendientes">
      {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
      {list.map((refund) => {
        // Se devuelve por donde entró; lo mixto o el saldo, Caja elige cómo.
        const original = refund.metodo_original;
        const suggested: RefundMethod = original === 'efectivo' ? 'efectivo' : 'terminal';
        const busy = confirm.isPending && confirm.variables?.refund.id === refund.id;
        return (
          <article key={refund.id} className="pending-refund" role="alert">
            <HandCoins aria-hidden="true" />
            <div>
              <strong>Devolver {formatMoney(refund.monto)}</strong>
              <p>
                {ORIGIN_LABEL[refund.origen]} · se pagó con {methodLabel(original)}
              </p>
            </div>
            {canConfirm && (
              <div className="pending-refund__actions">
                <Button
                  variant="dark"
                  loading={busy && confirm.variables?.method === suggested}
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate({ refund, method: suggested })}
                >
                  Devuelto en {suggested}
                </Button>
                {original !== 'efectivo' && (
                  <Button
                    variant="secondary"
                    loading={busy && confirm.variables?.method === 'efectivo'}
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate({ refund, method: 'efectivo' })}
                  >
                    En efectivo
                  </Button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
