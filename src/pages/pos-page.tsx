import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CircleDollarSign, Clock3, LockKeyhole, WalletCards } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Feedback, Field, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';

const moneySchema = z.object({
  amount: z.string().regex(/^\d+\.\d{2}$/, 'Usa pesos con dos decimales, por ejemplo 500.00.'),
});

type MoneyForm = z.infer<typeof moneySchema>;

export function PosPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const queryClient = useQueryClient();
  const canOperate = tenant?.context.rol === 'admin' || tenant?.context.rol === 'cajero';

  const session = useQuery({
    queryKey: ['cash-session'],
    enabled: Boolean(token),
    queryFn: () => api.activeCashSession(token),
    refetchInterval: 15_000,
  });

  const openMutation = useMutation({
    mutationFn: ({ amount }: MoneyForm) => api.openCashSession(token, amount),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['cash-session'] }),
  });
  const closeMutation = useMutation({
    mutationFn: ({ amount }: MoneyForm) => {
      if (!session.data) throw new Error('No existe una sesión abierta.');
      return api.closeCashSession(token, session.data.id, amount);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['cash-session'] }),
  });

  const openForm = useForm<MoneyForm>({
    resolver: zodResolver(moneySchema),
    defaultValues: { amount: '500.00' },
  });
  const closeForm = useForm<MoneyForm>({
    resolver: zodResolver(moneySchema),
    defaultValues: { amount: '' },
  });

  const active = session.data;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operación POS"
        title="Sesión de Caja"
        description="La Caja abierta habilita la recepción de pedidos. Esta Web usa exactamente las rutas y reglas del POS móvil."
      />

      {session.isError && <Feedback tone="error">{errorMessage(session.error)}</Feedback>}
      {openMutation.isError && <Feedback tone="error">{errorMessage(openMutation.error)}</Feedback>}
      {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
      {openMutation.isSuccess && <Feedback tone="success">La sesión de Caja quedó abierta.</Feedback>}
      {closeMutation.isSuccess && <Feedback tone="success">La sesión de Caja quedó cerrada.</Feedback>}

      <section className={`cash-hero ${active ? 'cash-hero--open' : ''}`}>
        <div className="cash-hero__icon"><WalletCards aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">Estado actual</p>
          <h2>{session.isPending ? 'Consultando…' : active ? 'Caja abierta' : 'Caja cerrada'}</h2>
          <p>
            {active
              ? `Abierta ${formatDate(active.abierta_en)} con $${active.monto_inicial} MXN.`
              : 'El establecimiento no recibe pedidos mientras no exista una sesión abierta.'}
          </p>
        </div>
        <span className={`cash-state ${active ? 'cash-state--open' : ''}`}>
          <span /> {active ? 'Operando' : 'Sin operar'}
        </span>
      </section>

      {active && (
        <section className="stats-grid" aria-label="Datos de la sesión de Caja">
          <article className="stat-card">
            <span className="stat-card__icon"><CalendarDays aria-hidden="true" /></span>
            <div><p>Fecha operativa</p><strong className="text-xl">{active.fecha_operativa}</strong></div>
          </article>
          <article className="stat-card">
            <span className="stat-card__icon"><CircleDollarSign aria-hidden="true" /></span>
            <div><p>Monto inicial</p><strong className="text-xl">${active.monto_inicial}</strong></div>
          </article>
          <article className="stat-card">
            <span className="stat-card__icon"><Clock3 aria-hidden="true" /></span>
            <div><p>Tipo de apertura</p><strong className="text-xl">{active.cierre_automatico ? 'Automática' : 'Manual'}</strong></div>
          </article>
        </section>
      )}

      {!canOperate ? (
        <section className="operation-card">
          <LockKeyhole aria-hidden="true" className="size-7 text-muted" />
          <div>
            <h2>Acceso de solo consulta</h2>
            <p>Tu rol puede consultar la sesión activa, pero solo Caja o Administración pueden abrirla o cerrarla.</p>
          </div>
        </section>
      ) : active ? (
        <section className="operation-card">
          <div>
            <p className="eyebrow">Cierre manual</p>
            <h2>Cerrar sesión de Caja</h2>
            <p>Al cerrar, el backend expira los pedidos en efectivo que sigan por cobrar y registra el movimiento.</p>
          </div>
          <form
            className="operation-form"
            onSubmit={(event) => void closeForm.handleSubmit((data) => closeMutation.mutate(data))(event)}
          >
            <Field
              label="Monto final (MXN)"
              inputMode="decimal"
              placeholder="725.50"
              error={closeForm.formState.errors.amount?.message}
              {...closeForm.register('amount')}
            />
            <Button type="submit" variant="dark" loading={closeMutation.isPending}>Cerrar Caja</Button>
          </form>
        </section>
      ) : (
        <section className="operation-card">
          <div>
            <p className="eyebrow">Apertura</p>
            <h2>Abrir sesión de Caja</h2>
            <p>Confirma el fondo inicial. La operación será idempotente y quedará registrada por el backend.</p>
          </div>
          <form
            className="operation-form"
            onSubmit={(event) => void openForm.handleSubmit((data) => openMutation.mutate(data))(event)}
          >
            <Field
              label="Monto inicial (MXN)"
              inputMode="decimal"
              placeholder="500.00"
              error={openForm.formState.errors.amount?.message}
              {...openForm.register('amount')}
            />
            <Button type="submit" loading={openMutation.isPending}>Abrir Caja</Button>
          </form>
        </section>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
