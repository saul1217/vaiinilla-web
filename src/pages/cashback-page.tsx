import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgePercent,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { PeriodSelector } from '../components/analytics-dashboard';
import { Button, Feedback, Field, Modal, PageHeader, SelectField } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { defaultAnalyticsPeriod, formatAnalyticsMoney } from '../lib/analytics';
import type {
  CashbackRule,
  CashbackRuleInput,
  WalletMovementMetric,
  WalletMovementType,
} from '../types/api';

const days = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
] as const;

const movementLabels: Record<WalletMovementType, string> = {
  recarga_efectivo: 'Recargas en efectivo',
  compra: 'Compras con saldo',
  cashback: 'Cashback entregado',
  cancelacion: 'Devoluciones',
  ajuste: 'Ajustes administrativos',
};

interface RuleDraft {
  nombre: string;
  porcentaje: string;
  horaInicio: string;
  horaFin: string;
  diasActivos: number[];
  vigenciaInicio: string;
  vigenciaFin: string;
  activa: boolean;
}

const emptyDraft: RuleDraft = {
  nombre: 'Regla principal',
  porcentaje: '0.00',
  horaInicio: '',
  horaFin: '',
  diasActivos: [],
  vigenciaInicio: '',
  vigenciaFin: '',
  activa: false,
};

function draftFromRule(rule: CashbackRule | null): RuleDraft {
  if (!rule) return emptyDraft;
  return {
    nombre: rule.nombre,
    porcentaje: rule.porcentaje,
    horaInicio: rule.hora_inicio?.slice(0, 5) ?? '',
    horaFin: rule.hora_fin?.slice(0, 5) ?? '',
    diasActivos: rule.dias_activos ?? [],
    vigenciaInicio: rule.vigencia_inicio ?? '',
    vigenciaFin: rule.vigencia_fin ?? '',
    activa: rule.activa,
  };
}

function inputFromDraft(draft: RuleDraft): CashbackRuleInput {
  return {
    nombre: draft.nombre.trim(),
    porcentaje: Number(draft.porcentaje).toFixed(2),
    hora_inicio: draft.horaInicio || null,
    hora_fin: draft.horaFin || null,
    dias_activos: draft.diasActivos.length ? [...draft.diasActivos].sort() : null,
    vigencia_inicio: draft.vigenciaInicio || null,
    vigencia_fin: draft.vigenciaFin || null,
    activa: draft.activa,
  };
}

function validateDraft(draft: RuleDraft): string | null {
  if (!draft.nombre.trim() || draft.nombre.trim().length > 120) {
    return 'El nombre debe tener entre 1 y 120 caracteres.';
  }
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(draft.porcentaje)) {
    return 'El porcentaje debe tener máximo dos decimales.';
  }
  const percentage = Number(draft.porcentaje);
  if (percentage < 0 || percentage > 100) return 'El porcentaje debe estar entre 0 y 100.';
  if (Boolean(draft.horaInicio) !== Boolean(draft.horaFin)) {
    return 'Indica tanto la hora inicial como la final, o deja ambas vacías.';
  }
  if (draft.horaInicio && draft.horaInicio === draft.horaFin) {
    return 'La hora inicial y la final deben ser distintas.';
  }
  if (draft.vigenciaInicio && draft.vigenciaFin && draft.vigenciaInicio > draft.vigenciaFin) {
    return 'La fecha inicial de vigencia no puede ser posterior a la final.';
  }
  return null;
}

export function CashbackPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const establishmentName = tenant?.access.establecimiento.nombre ?? 'este establecimiento';
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(defaultAnalyticsPeriod);
  const [draftOverride, setDraftOverride] = useState<RuleDraft | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<'todos' | WalletMovementType>('todos');

  const ruleQuery = useQuery({
    queryKey: ['cashback-rule', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.cashbackRule(token),
  });
  const analytics = useQuery({
    queryKey: ['tenant-analytics', scopeId, period.desde, period.hasta],
    enabled: Boolean(token),
    queryFn: () => api.tenantAnalytics(token, period),
  });

  const draft = draftOverride ?? draftFromRule(ruleQuery.data ?? null);
  const dirty = draftOverride !== null;

  const mutation = useMutation({
    mutationFn: (input: CashbackRuleInput) => api.configureCashback(token, input),
    onSuccess: (rule) => {
      queryClient.setQueryData(['cashback-rule', scopeId], rule);
      setDraftOverride(null);
      setValidationError(null);
      setConfirmationOpen(false);
      setSuccessMessage(
        'La regla quedó guardada y el cambio ya tiene fecha y actor en el backend.',
      );
    },
  });

  const movements = useMemo(() => {
    const all = analytics.data?.wallet?.movimientos ?? [];
    return movementType === 'todos' ? all : all.filter((item) => item.tipo === movementType);
  }, [analytics.data?.wallet?.movimientos, movementType]);

  function updateDraft(patch: Partial<RuleDraft>) {
    setDraftOverride((current) => ({
      ...(current ?? draftFromRule(ruleQuery.data ?? null)),
      ...patch,
    }));
    setSuccessMessage(null);
    setValidationError(null);
  }

  function requestConfirmation(event: FormEvent) {
    event.preventDefault();
    const issue = validateDraft(draft);
    setValidationError(issue);
    if (!issue) setConfirmationOpen(true);
  }

  function toggleDay(day: number) {
    updateDraft({
      diasActivos: draft.diasActivos.includes(day)
        ? draft.diasActivos.filter((item) => item !== day)
        : [...draft.diasActivos, day],
    });
  }

  const report = analytics.data;
  const reconciliation = report?.wallet?.conciliacion;
  const previousRule = ruleQuery.data;

  return (
    <div className="page-stack cashback-page">
      <PageHeader
        eyebrow="Administración financiera"
        title="Cashback y wallet"
        description="Configura el beneficio y consulta únicamente información agregada del establecimiento. Los saldos individuales y el ledger no se pueden editar aquí."
      />

      <section className="cashback-context" aria-label="Contexto activo">
        <span>
          <WalletCards aria-hidden="true" />
        </span>
        <div>
          <strong>{establishmentName}</strong>
          <p>Los cambios y métricas pertenecen solo a este establecimiento.</p>
        </div>
      </section>

      <section className="cashback-layout">
        <form className="cashback-form panel-card" onSubmit={requestConfirmation} noValidate>
          <header className="cashback-section-header">
            <div>
              <p className="eyebrow">Regla vigente</p>
              <h2>Configurar cashback</h2>
              <p>El porcentaje se calcula al entregar el pedido y nunca al crearlo.</p>
            </div>
            <label className="cashback-switch">
              <input
                type="checkbox"
                checked={draft.activa}
                onChange={(event) => updateDraft({ activa: event.target.checked })}
              />
              <span>{draft.activa ? 'Activa' : 'Inactiva'}</span>
            </label>
          </header>

          {ruleQuery.isError && <Feedback tone="error">{errorMessage(ruleQuery.error)}</Feedback>}
          {validationError && <Feedback tone="error">{validationError}</Feedback>}
          {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
          {successMessage && <Feedback tone="success">{successMessage}</Feedback>}

          <div className="cashback-fields">
            <Field
              id="cashback-name"
              label="Nombre de la regla"
              value={draft.nombre}
              maxLength={120}
              onChange={(event) => updateDraft({ nombre: event.target.value })}
              disabled={ruleQuery.isPending}
            />
            <Field
              id="cashback-percentage"
              label="Porcentaje"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={draft.porcentaje}
              hint="Ejemplo: 5.00 equivale a 5%."
              onChange={(event) => updateDraft({ porcentaje: event.target.value })}
              disabled={ruleQuery.isPending}
            />
          </div>

          <fieldset className="cashback-fieldset">
            <legend>Horario opcional</legend>
            <p>
              Déjalo vacío para aplicar durante todo el día. Se permiten horarios que cruzan
              medianoche.
            </p>
            <div className="cashback-fields">
              <Field
                id="cashback-start-time"
                label="Hora inicial"
                type="time"
                value={draft.horaInicio}
                onChange={(event) => updateDraft({ horaInicio: event.target.value })}
              />
              <Field
                id="cashback-end-time"
                label="Hora final"
                type="time"
                value={draft.horaFin}
                onChange={(event) => updateDraft({ horaFin: event.target.value })}
              />
            </div>
          </fieldset>

          <fieldset className="cashback-fieldset">
            <legend>Días activos</legend>
            <p>Sin selección significa todos los días.</p>
            <div className="cashback-days">
              {days.map((day) => (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={draft.diasActivos.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cashback-fieldset">
            <legend>Vigencia opcional</legend>
            <p>Puedes definir solo una fecha inicial, solo una final o ambas.</p>
            <div className="cashback-fields">
              <Field
                id="cashback-valid-from"
                label="Vigente desde"
                type="date"
                value={draft.vigenciaInicio}
                max={draft.vigenciaFin || undefined}
                onChange={(event) => updateDraft({ vigenciaInicio: event.target.value })}
              />
              <Field
                id="cashback-valid-until"
                label="Vigente hasta"
                type="date"
                value={draft.vigenciaFin}
                min={draft.vigenciaInicio || undefined}
                onChange={(event) => updateDraft({ vigenciaFin: event.target.value })}
              />
            </div>
          </fieldset>

          <footer className="cashback-form-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={!dirty || mutation.isPending}
              onClick={() => {
                setDraftOverride(null);
                setValidationError(null);
              }}
            >
              <RotateCcw aria-hidden="true" className="size-5" />
              Descartar
            </Button>
            <Button type="submit" disabled={!dirty || ruleQuery.isPending}>
              <BadgePercent aria-hidden="true" className="size-5" />
              Revisar cambio
            </Button>
          </footer>
          {previousRule && (
            <p className="cashback-audit-note">
              Última actualización:{' '}
              {new Intl.DateTimeFormat('es-MX', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(previousRule.actualizado_en))}
            </p>
          )}
        </form>

        <aside className="cashback-help panel-card">
          <span className="cashback-help__icon">
            <BadgePercent aria-hidden="true" />
          </span>
          <p className="eyebrow">Cómo se aplica</p>
          <h2>Automático al entregar</h2>
          <ol>
            <li>El pedido debe llegar al estado entregado.</li>
            <li>El servidor valida fecha, día y horario del establecimiento.</li>
            <li>El monto se abona una sola vez y queda en el ledger.</li>
          </ol>
          <p className="cashback-help__limit">
            Esta pantalla no permite modificar saldos ni movimientos individuales.
          </p>
        </aside>
      </section>

      <div className="section-heading cashback-report-heading">
        <div>
          <p className="eyebrow">Operación agregada</p>
          <h2>Resumen de wallet</h2>
        </div>
      </div>
      <PeriodSelector value={period} onChange={setPeriod} />
      {analytics.isError && <Feedback tone="error">{errorMessage(analytics.error)}</Feedback>}

      <section className="cashback-kpis" aria-label="Indicadores de wallet">
        <WalletKpi
          icon={<CircleDollarSign aria-hidden="true" />}
          label="Recargas"
          value={report ? formatAnalyticsMoney(report.resumen.recargas) : '—'}
          description="Efectivo confirmado por Caja"
        />
        <WalletKpi
          icon={<ShoppingBag aria-hidden="true" />}
          label="Compras con saldo"
          value={report ? formatAnalyticsMoney(report.resumen.compras_saldo ?? '0.00') : '—'}
          description="Consumo total de wallet"
        />
        <WalletKpi
          icon={<BadgePercent aria-hidden="true" />}
          label="Cashback otorgado"
          value={report ? formatAnalyticsMoney(report.resumen.cashback_otorgado ?? '0.00') : '—'}
          description="Abonado al entregar"
        />
        <WalletKpi
          icon={<RefreshCw aria-hidden="true" />}
          label="Devoluciones"
          value={report ? formatAnalyticsMoney(report.resumen.cancelaciones_wallet ?? '0.00') : '—'}
          description={`${report?.resumen.pedidos_cancelados ?? 0} pedidos cancelados`}
        />
      </section>

      <section className="cashback-operations panel-card">
        <header className="cashback-section-header">
          <div>
            <p className="eyebrow">Desglose</p>
            <h2>Movimientos por tipo</h2>
            <p>Solo se muestran importes y conteos agregados; no hay datos de clientes.</p>
          </div>
          <SelectField
            id="wallet-movement-type"
            label="Tipo de movimiento"
            value={movementType}
            onChange={(event) => setMovementType(event.target.value as typeof movementType)}
          >
            <option value="todos">Todos</option>
            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </header>

        {analytics.isPending ? (
          <div className="cashback-loading" role="status">
            Consultando movimientos agregados…
          </div>
        ) : movements.length ? (
          <div className="cashback-movement-list">
            {movements.map((item) => (
              <MovementRow key={item.tipo} item={item} />
            ))}
          </div>
        ) : (
          <div className="cashback-empty">No hay movimientos de este tipo en el periodo.</div>
        )}
      </section>

      <section
        className={`cashback-reconciliation panel-card${reconciliation?.alertas ? ' cashback-reconciliation--warning' : ''}`}
        aria-live="polite"
      >
        <span className="cashback-reconciliation__icon">
          {reconciliation?.alertas ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="eyebrow">Conciliación</p>
          <h2>
            {analytics.isPending
              ? 'Revisando balances'
              : reconciliation?.alertas
                ? `${reconciliation.alertas} alertas requieren revisión`
                : 'Sin diferencias detectadas'}
          </h2>
          <p>
            {reconciliation
              ? `${reconciliation.wallets_revisadas} wallets comparadas contra su ledger completo.`
              : 'El dato aparecerá cuando el backend actualizado esté desplegado.'}
          </p>
        </div>
      </section>

      <Modal
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title="Confirmar cambio de cashback"
        description={`Este cambio se aplicará únicamente a ${establishmentName}.`}
      >
        <div className="cashback-confirmation">
          <div>
            <span>Estado</span>
            <strong>
              {previousRule?.activa ? 'Activa' : 'Inactiva'} →{' '}
              {draft.activa ? 'Activa' : 'Inactiva'}
            </strong>
          </div>
          <div>
            <span>Porcentaje</span>
            <strong>
              {previousRule?.porcentaje ?? '0.00'}% → {Number(draft.porcentaje).toFixed(2)}%
            </strong>
          </div>
          <div>
            <span>Vigencia nueva</span>
            <strong>{formatValidity(draft)}</strong>
          </div>
        </div>
        <Feedback tone="info">
          El backend conservará la regla anterior como evidencia y registrará quién realizó el
          cambio.
        </Feedback>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={() => setConfirmationOpen(false)}>
            Volver
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            onClick={() => mutation.mutate(inputFromDraft(draft))}
          >
            Confirmar y guardar
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function WalletKpi({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <article className="cashback-kpi">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}

function MovementRow({ item }: { item: WalletMovementMetric }) {
  return (
    <article>
      <div>
        <strong>{movementLabels[item.tipo]}</strong>
        <span>
          {item.operaciones} {item.operaciones === 1 ? 'operación' : 'operaciones'}
        </span>
      </div>
      <strong>{formatAnalyticsMoney(item.monto)}</strong>
    </article>
  );
}

function formatValidity(draft: RuleDraft): string {
  if (!draft.vigenciaInicio && !draft.vigenciaFin) return 'Sin límite de fechas';
  if (draft.vigenciaInicio && draft.vigenciaFin) {
    return `${draft.vigenciaInicio} a ${draft.vigenciaFin}`;
  }
  if (draft.vigenciaInicio) return `Desde ${draft.vigenciaInicio}`;
  return `Hasta ${draft.vigenciaFin}`;
}
