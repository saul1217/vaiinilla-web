// Pagos con tarjeta del negocio, para su dueño. Mientras no se active aquí, las apps y la
// web de compra no muestran "tarjeta". Activar exige que Stripe ya permita cobrar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import { Choice } from './choice';
import { Button, Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { cardPaymentsStep } from '../lib/card-payments';
import type { StripeOnboarding } from '../types/api';

export function CardPaymentsCard({ token, scopeId }: { token: string; scopeId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['card-payments', scopeId];
  const query = useQuery({ queryKey, enabled: Boolean(token), queryFn: () => api.cardPayments(token) });
  // Stripe pide los datos del dueño en otra pestaña; al volver aquí, la consulta se
  // actualiza sola al recuperar el foco. La pestaña se abre en el clic para que el
  // navegador no la bloquee, y recibe el enlace cuando llega.
  const onboarding = useMutation<StripeOnboarding, Error, Window | null>({
    mutationFn: () => api.startCardPaymentsOnboarding(token),
    onSuccess: (link, tab) => {
      if (tab) tab.location.href = link.account_link_url;
      else window.location.assign(link.account_link_url);
    },
    onError: (_error, tab) => tab?.close(),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.setCardPayments(token, enabled),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  const commission = useMutation({
    mutationFn: (pass: boolean) => api.setCardCommissionPassThrough(token, pass),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      // Cambia el precio que ve el cliente con tarjeta: el menú se vuelve a pedir.
      void queryClient.invalidateQueries({ queryKey: ['catalog', scopeId] });
    },
  });

  const step = cardPaymentsStep(query.data);
  const enabled = Boolean(query.data?.stripe_enabled) && step === 'ready';

  return (
    <section className="panel-card grid gap-4 p-5 sm:p-6" aria-labelledby="card-payments-title">
      <div className="flex items-start gap-3">
        <CreditCard aria-hidden="true" className="mt-1 size-6 shrink-0 text-ink" />
        <div>
          <h2 id="card-payments-title" className="text-xl font-extrabold text-ink">
            Pagos con tarjeta
          </h2>
          <p className="mt-1 text-sm text-muted">
            {enabled
              ? 'Activos: tus clientes ven "tarjeta" al pagar en la app y en la web.'
              : 'Apagados: tus clientes solo ven efectivo, saldo y pagar al final.'}
          </p>
        </div>
      </div>

      {query.isError && <Feedback tone="error">{errorMessage(query.error)}</Feedback>}
      {onboarding.isError && <Feedback tone="error">{errorMessage(onboarding.error)}</Feedback>}
      {toggle.isError && <Feedback tone="error">{errorMessage(toggle.error)}</Feedback>}
      {commission.isError && <Feedback tone="error">{errorMessage(commission.error)}</Feedback>}
      {query.isLoading && <div className="table-loading">Consultando tu cuenta de Stripe…</div>}

      {!query.isLoading && !query.isError && step !== 'ready' && (
        <div className="grid gap-3 rounded-2xl bg-cream p-4">
          <p className="text-sm text-ink">
            {step === 'connect'
              ? 'Para cobrar con tarjeta, primero conecta tu cuenta de Stripe. Ahí registras tus datos y tu cuenta para recibir el dinero.'
              : 'Stripe todavía no habilita tu cuenta para cobrar. Termina lo que falta en Stripe y vuelve aquí para activarla.'}
          </p>
          <div>
            <Button loading={onboarding.isPending} onClick={() => onboarding.mutate(window.open('', '_blank'))}>
              <ExternalLink aria-hidden="true" className="size-5" />
              {step === 'connect' ? 'Conectar mi cuenta de Stripe' : 'Completar en Stripe'}
            </Button>
          </div>
        </div>
      )}

      {step === 'ready' && (
        <Choice
          name="¿Aceptas pagos con tarjeta?"
          value={enabled}
          onChange={(value) => {
            if (value !== enabled && !toggle.isPending) toggle.mutate(value);
          }}
          options={[
            { value: true, label: 'Sí, aceptar tarjeta', hint: 'Tus clientes pueden pagar con tarjeta desde la app o la web.' },
            { value: false, label: 'No, solo otros pagos', hint: 'La opción de tarjeta no aparece. Los pedidos ya pagados no cambian.' },
          ]}
        />
      )}

      {step === 'ready' && (
        <h3 className="mt-2 text-base font-extrabold text-ink">¿Quién paga la comisión de la tarjeta?</h3>
      )}
      {step === 'ready' && (
        <Choice
          name="¿Quién paga la comisión de la tarjeta?"
          value={Boolean(query.data?.pasar_comision_al_cliente)}
          onChange={(value) => {
            if (value !== Boolean(query.data?.pasar_comision_al_cliente) && !commission.isPending) commission.mutate(value);
          }}
          options={[
            {
              value: false,
              label: 'Yo, el negocio',
              hint: 'Tus clientes pagan el precio de mostrador, también con tarjeta. La comisión se descuenta de tu venta.',
            },
            {
              value: true,
              label: 'El cliente',
              hint: 'Con tarjeta, el cliente paga un poco más para cubrir la comisión. Con efectivo o saldo paga el precio de mostrador.',
            },
          ]}
        />
      )}
    </section>
  );
}
