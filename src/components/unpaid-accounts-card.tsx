import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';
import { unpaidAgeLabel } from '../lib/unpaid';
import type { UnpaidAccount } from '../types/api';
import { Button, Feedback, Field, Modal } from './ui';

/**
 * Cuentas abiertas (pagar al final) que nadie ha cobrado. Las **abandonadas** son de un espacio que
 * ya se liberó: alguien se fue sin pagar. Si no hay nada pendiente, no ocupa lugar en el Resumen.
 */
export function UnpaidAccountsCard() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const accounts = useQuery({
    queryKey: ['unpaid-accounts', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.unpaidAccounts(token),
    refetchInterval: 30_000,
  });
  // Solo admin puede cerrar una mesa con deuda (el backend lo exige): para quien se fue sin pagar.
  const canForceClose = tenant?.context.rol === 'admin';
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState<UnpaidAccount | null>(null);
  const [note, setNote] = useState('');
  const forceClose = useMutation({
    mutationFn: (account: UnpaidAccount) => api.releaseSpace(token, account.espacio.id, undefined, true, note.trim()),
    onSuccess: async () => {
      setClosing(null);
      await queryClient.invalidateQueries({ queryKey: ['unpaid-accounts', scopeId] });
    },
  });

  if (accounts.isError) return <Feedback tone="error">{errorMessage(accounts.error)}</Feedback>;
  const data = accounts.data;
  if (!data || data.cuentas.length === 0) return null;

  return (
    <section className="panel-card p-5 sm:p-6" aria-labelledby="unpaid-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
          {data.abandonadas > 0 ? <AlertTriangle aria-hidden="true" /> : <ReceiptText aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="unpaid-title" className="text-xl font-extrabold text-ink">
            Cuentas sin cobrar
          </h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {formatMoney(data.total)} en {data.cuentas.length} {data.cuentas.length === 1 ? 'cuenta' : 'cuentas'}
            {data.abandonadas > 0
              ? ` · ${data.abandonadas} ${data.abandonadas === 1 ? 'se fue sin pagar' : 'se fueron sin pagar'}`
              : ''}
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {data.cuentas.map((account) => (
          <li
            key={account.espacio.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3 text-sm ${
              account.abandonada ? 'bg-coral/15' : 'bg-cream'
            }`}
          >
            <strong className="text-ink">{account.espacio.nombre}</strong>
            <span className="text-muted">
              {account.pedidos} {account.pedidos === 1 ? 'pedido' : 'pedidos'}
              {account.clientes.length > 0 ? ` · ${account.clientes.join(', ')}` : ''}
            </span>
            <span className="text-muted">{unpaidAgeLabel(account.horas)}</span>
            {account.abandonada && <span className="font-bold text-ink">Ya se liberó: se fue sin pagar</span>}
            <strong className="ml-auto text-ink">{formatMoney(account.total)}</strong>
            {canForceClose && !account.abandonada && (
              <Button variant="ghost" onClick={() => { forceClose.reset(); setNote(''); setClosing(account); }}>
                Cerrar sin cobrar
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(closing)}
        onOpenChange={(next) => { if (!next) setClosing(null); }}
        title={closing ? `Cerrar ${closing.espacio.nombre} sin cobrar` : 'Cerrar sin cobrar'}
        description="Úsalo solo si el cliente se fue sin pagar. No cobra nada."
      >
        {closing && (
          <div className="transaction-form">
            {forceClose.isError && <Feedback tone="error">{errorMessage(forceClose.error)}</Feedback>}
            <p>
              Quedan {formatMoney(closing.total)} sin cobrar. El espacio se libera, el cierre queda registrado como
              forzado con tu nombre y la hora, y la deuda sigue en esta lista.
            </p>
            <Field
              label="Motivo (opcional)"
              name="force-close-note"
              maxLength={240}
              value={note}
              placeholder="Se fue sin pagar"
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setClosing(null)}>No cerrar</Button>
              <Button variant="dark" loading={forceClose.isPending} onClick={() => forceClose.mutate(closing)}>
                Cerrar sin cobrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
