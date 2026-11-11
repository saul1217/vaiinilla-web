import { AppPageHeader } from '../components/app-page-header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Link2, CreditCard, MapPin, Image as ImageIcon, Workflow } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardPaymentsCard } from '../components/card-payments-card';
import { StoreDirectoryCard } from '../components/store-directory-card';
import { StoreImagesCard } from '../components/store-images-card';
import { StoreVideosCard } from '../components/store-videos-card';
import { Choice } from '../components/choice';
import { Button, Feedback, Field } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import {
  isNotFound,
  isVersionConflict,
  operationLabel,
  reasonLabel,
  splitTransition,
  transitionBlockDetails,
} from '../lib/config-transition';
import { createIdempotencyKey } from '../lib/idempotency';
import { cardPaymentsStep } from '../lib/card-payments';
import {
  BUSINESS_TYPE_LABELS,
  buildFlow,
  FLOW_TEMPLATES,
  flowSummary,
  franjasError,
  MAX_FRANJAS,
  matchingTemplate,
  MAX_GRACE_MINUTES,
  sameSettings,
  sortFranjas,
  validGrace,
  type BusinessType,
  type FlowSettings,
} from '../lib/business-flow';
import type {
  BusinessSettings,
  BusinessSettingsInput,
  ConfigurationTransitionChanges,
  ConfigurationTransitionOperation,
  ConfigurationTransitionPreflight,
} from '../types/api';
import { StoreFlowEditButton, StoreFlowEditorSheet, type StoreFlowEditor } from '../components/store-flow-editor-sheet';

function mediaSummary(settings: BusinessSettings) {
  const images = [settings.logo_url, settings.imagen_url].filter(Boolean).length;
  const videos = (settings.videos_local ?? []).length;
  return `${images} ${images === 1 ? 'imagen' : 'imágenes'} · ${videos} ${videos === 1 ? 'video' : 'videos'}`;
}

const KNOWN_TYPES = Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[];

function toSettings(data: BusinessSettings): FlowSettings | null {
  const tipo = KNOWN_TYPES.find((known) => known === data.tipo);
  if (!tipo) return null;
  return {
    tipo,
    entrega_requiere_qr: data.entrega_requiere_qr,
    permite_pago_al_final: data.permite_pago_al_final,
    permite_saldo: data.permite_saldo ?? true,
    gracia_liberacion_min: data.gracia_liberacion_min,
    franjas_pedido: data.franjas_pedido ?? [],
    entrega_en_espacio: data.entrega_en_espacio ?? 'mesa',
  };
}

/** Lo que el borrador cambia respecto a lo guardado (sin campos de solo lectura). */
function flowInput(input: FlowSettings): BusinessSettingsInput {
  return { ...input, franjas_pedido: sortFranjas(input.franjas_pedido) };
}

const SPACE_DELIVERY_LABELS: Record<NonNullable<FlowSettings['entrega_en_espacio']>, string> = {
  mesa: 'Lo lleva el mesero',
  barra: 'Pasan por él a la barra',
  ambas: 'El cliente elige',
};

/** Cómo se lee cada campo de transición en la revisión: «Antes → Después». */
function transitionValue(field: string, value: unknown): string {
  if (field === 'tipo') return BUSINESS_TYPE_LABELS[value as BusinessType] ?? String(value);
  if (field === 'entrega_en_espacio') return SPACE_DELIVERY_LABELS[value as 'mesa'] ?? String(value);
  if (field === 'permite_pago_al_final') return value ? 'Al final, con cuenta abierta' : 'Al pedir';
  if (field === 'entrega_requiere_qr') return value ? 'Con QR' : 'Sin QR';
  return value ? 'Sí' : 'No';
}

const TRANSITION_FIELD_LABELS: Record<string, string> = {
  tipo: 'Tipo de negocio',
  entrega_en_espacio: 'Pedido en mesa',
  entrega_requiere_qr: 'Entrega',
  permite_pago_al_final: 'Cuándo pagan',
  barra_prepara: 'Barra prepara',
  permite_pago_en_caja: 'Pago en caja',
  cocina_prepara_sin_cobrar: 'Cocina prepara sin cobrar',
};

/** Revisión (preflight) de un guardado que cambia tipo o modos. La llave es de esta revisión. */
interface TransitionReview {
  transition: ConfigurationTransitionChanges;
  ordinary: BusinessSettingsInput;
  preflight: ConfigurationTransitionPreflight;
  key: string;
}

function BlockList({
  reasons,
  operations,
  total,
}: {
  reasons: string[];
  operations: ConfigurationTransitionOperation[];
  total: number;
}) {
  const shownReasons = reasons.filter((code) => code !== 'OPERATIONS_IN_FLIGHT' || operations.length === 0);
  return (
    <div className="grid gap-2 text-sm">
      {shownReasons.length > 0 && (
        <ul className="grid gap-1" aria-label="Motivos del bloqueo">
          {shownReasons.map((code) => <li key={code}>{reasonLabel(code)}</li>)}
        </ul>
      )}
      {operations.length > 0 && (
        <>
          <p className="font-semibold">Cierra o termina antes estas operaciones:</p>
          <ul className="grid gap-1" aria-label="Operaciones que bloquean">
            {operations.map((op) => (
              <li key={`${op.code}-${op.id}`}>
                {operationLabel(op.code)}
                {op.referencia ? ` ${op.referencia}` : ''}
                {op.estado ? ` · ${op.estado}` : ''}
              </li>
            ))}
          </ul>
          {total > operations.length && <p className="text-muted">Y {total - operations.length} más.</p>}
        </>
      )}
    </div>
  );
}

export function StoreFlowPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FlowSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState<TransitionReview | null>(null);
  const [editor, setEditor] = useState<StoreFlowEditor>(null);
  const opener = useRef<HTMLElement>(null);
  const openEditor = (next: Exclude<StoreFlowEditor, null>, event: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
    setEditor(next);
  };

  // Misma queryKey que CardPaymentsCard: comparte caché y no duplica peticiones.
  const cardPayments = useQuery({
    queryKey: ['card-payments', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.cardPayments(token),
  });
  const cardStep = cardPaymentsStep(cardPayments.data);
  const stripeStatus = cardPayments.isLoading
    ? 'Consultando Stripe…'
    : cardPayments.isError
      ? 'No se pudo consultar Stripe'
      : cardStep === 'connect'
        ? 'Cuenta de Stripe sin conectar'
        : cardStep === 'finish'
          ? 'Configuración pendiente en Stripe'
          : cardPayments.data?.stripe_enabled
            ? 'Pagos con tarjeta activos'
            : 'Pagos con tarjeta desactivados';

  const query = useQuery({
    queryKey: ['business-settings', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.businessSettings(token),
  });
  const current = query.data ? toSettings(query.data) : null;
  const settings = draft ?? current;
  const showSaved = (data: BusinessSettings) => {
    // Mostrar ya lo guardado: si no, la página enseña un instante los datos viejos hasta recargar.
    queryClient.setQueryData(['business-settings', scopeId], data);
    setDraft(null);
    setReview(null);
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
  };
  // Guardar: el tipo y los modos (campos de transición) pasan por una revisión previa que el
  // usuario confirma; lo demás va en el PATCH. Sin campos de transición, solo el PATCH.
  const save = useMutation({
    mutationFn: async (input: FlowSettings) => {
      // Un backend anterior no manda entrega_en_espacio: se compara contra lo de siempre (mesa).
      const saved = query.data ? { ...query.data, entrega_en_espacio: query.data.entrega_en_espacio ?? 'mesa' } : null;
      const { transition, ordinary } = splitTransition(flowInput(input), saved);
      if (!transition) return { saved: await api.saveBusinessSettings(token, ordinary) };
      const preflight = await api.preflightBusinessTransition(token, { cambios: transition });
      return { review: { transition, ordinary, preflight, key: createIdempotencyKey() } satisfies TransitionReview };
    },
    onMutate: () => setReview(null),
    onSuccess: (result) => {
      if (result.saved) showSaved(result.saved);
      else if (result.review) setReview(result.review);
    },
  });
  // Aplica la transición revisada una vez, con la llave de la revisión (el 503 se repite una sola
  // vez dentro de api), y después el PATCH de los ajustes ordinarios.
  const apply = useMutation({
    mutationFn: async (current: TransitionReview) => {
      await api.applyBusinessTransition(
        token,
        { version_esperada: current.preflight.version_actual, cambios: current.transition },
        current.key,
      );
      return Object.keys(current.ordinary).length
        ? api.saveBusinessSettings(token, current.ordinary)
        : api.businessSettings(token);
    },
    onSuccess: showSaved,
    // Si la transición entró y falló el PATCH, la recarga deja pendiente solo lo ordinario.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] }),
  });
  const recheck = () => {
    apply.reset();
    if (settings) save.mutate(settings);
  };

  function change(next: Partial<FlowSettings>) {
    if (!settings) return;
    setSaved(false);
    setReview(null);
    apply.reset();
    setDraft({ ...settings, ...next });
  }

  const changed = Boolean(
    settings &&
      current &&
      (!sameSettings(settings, current) || (settings.entrega_en_espacio ?? 'mesa') !== (current.entrega_en_espacio ?? 'mesa')),
  );
  const slotsError = settings && settings.franjas_pedido.length > 0 ? franjasError(settings.franjas_pedido) : null;
  const graceValid = Boolean(settings && validGrace(settings.gracia_liberacion_min));
  const valid = graceValid && !slotsError;
  const template = settings ? matchingTemplate(settings) : null;
  const steps = settings ? buildFlow(settings) : [];
  const summary = flowSummary(steps);
  const unknownType = Boolean(query.data && !current);

  return (
    <div className="page-stack admin-screen admin-flow">
      <AppPageHeader
        eyebrow="Operación del establecimiento"
        title="Flujo de mi tienda"
        description="Elige cómo funciona tu negocio: cuándo pagan, cómo se entrega y cuánto dura un turno. Toca una tarjeta para configurarla; el flujo paso a paso por rol está en «Cómo funciona tu tienda»."
      />
      {query.isError && <Feedback tone="error">{errorMessage(query.error)}</Feedback>}
      {save.isError && (
        <Feedback tone="error">
          {isNotFound(save.error)
            ? 'Este servidor todavía no tiene la revisión de cambios de tipo o modo (404). Tus cambios siguen aquí; inténtalo más tarde.'
            : errorMessage(save.error)}
        </Feedback>
      )}
      {saved && !save.isError && !changed && (
        <Feedback tone="success">Flujo guardado. Ya aplica a los pedidos nuevos.</Feedback>
      )}
      {unknownType && (
        <Feedback tone="error">
          Tu negocio tiene un tipo que esta pantalla no conoce ({query.data?.tipo}). Elige una plantilla para continuar.
        </Feedback>
      )}
      {query.isLoading && <div className="table-loading">Consultando tu negocio…</div>}

      <section className="store-flow-cards" aria-label="Configuración de mi tienda">
        <article className="panel-card store-flow-summary">
          <CreditCard aria-hidden="true" />
          <div>
            <h2>Pagos con tarjeta</h2>
            <p>{stripeStatus}</p>
          </div>
          <StoreFlowEditButton label="Configurar pagos con tarjeta" onClick={(event) => openEditor('payments', event)}>
            Configurar
          </StoreFlowEditButton>
        </article>
        <article className="panel-card store-flow-summary">
          <MapPin aria-hidden="true" />
          <div>
            <h2>Dónde te encuentran</h2>
            <p>
              {query.data
                ? query.data.visible_en_directorio
                  ? 'Visible en el directorio'
                  : 'Oculto del directorio'
                : query.isLoading
                  ? 'Consultando…'
                  : 'Información no disponible'}
            </p>
          </div>
          <StoreFlowEditButton label="Editar dónde te encuentran" onClick={(event) => openEditor('directory', event)}>
            {query.data ? 'Editar' : 'Configurar'}
          </StoreFlowEditButton>
        </article>
        <article className="panel-card store-flow-summary">
          <ImageIcon aria-hidden="true" />
          <div>
            <h2>Imagen y videos</h2>
            <p>
              {query.data ? mediaSummary(query.data) : query.isLoading ? 'Consultando…' : 'Información no disponible'}
            </p>
          </div>
          <StoreFlowEditButton label="Editar imagen y videos" onClick={(event) => openEditor('media', event)}>
            {query.data ? 'Editar' : 'Configurar'}
          </StoreFlowEditButton>
        </article>
        <article className="panel-card store-flow-summary">
          <Workflow aria-hidden="true" />
          <div>
            <h2>Cómo funciona tu tienda</h2>
            <p>
              {settings
                ? `${BUSINESS_TYPE_LABELS[settings.tipo]} · ${settings.permite_pago_al_final ? 'Pago al final' : 'Pago al pedir'}`
                : query.isLoading
                  ? 'Consultando…'
                  : 'Información no disponible'}
            </p>
          </div>
          <StoreFlowEditButton
            label="Configurar cómo funciona tu tienda"
            onClick={(event) => openEditor('flow', event)}
          >
            {changed ? 'Editar' : 'Configurar'}
          </StoreFlowEditButton>
        </article>
      </section>
      <StoreFlowEditorSheet
        open={editor === 'payments'}
        onOpenChange={(open) => !open && setEditor(null)}
        title="Pagos con tarjeta"
        returnFocusRef={opener}
      >
        <CardPaymentsCard token={token} scopeId={scopeId} />
      </StoreFlowEditorSheet>
      {query.data && (
        <StoreFlowEditorSheet
          open={editor === 'directory'}
          onOpenChange={(open) => !open && setEditor(null)}
          title="Dónde te encuentran"
          returnFocusRef={opener}
        >
          <StoreDirectoryCard token={token} scopeId={scopeId} settings={query.data} />
        </StoreFlowEditorSheet>
      )}
      {query.data && (
        <StoreFlowEditorSheet
          open={editor === 'media'}
          onOpenChange={(open) => !open && setEditor(null)}
          title="Imagen y videos"
          returnFocusRef={opener}
        >
          <div className="grid gap-6">
            <StoreImagesCard token={token} scopeId={scopeId} settings={query.data} />
            <StoreVideosCard token={token} scopeId={scopeId} settings={query.data} />
          </div>
        </StoreFlowEditorSheet>
      )}

      <StoreFlowEditorSheet
        open={editor === 'flow'}
        onOpenChange={(open) => !open && setEditor(null)}
        title="Cómo funciona tu tienda"
        description="Ajusta el flujo y guarda cuando esté listo."
        returnFocusRef={opener}
      >
        {(settings || unknownType) && (
          <>
            <section className="panel-card p-5 sm:p-6" aria-labelledby="flow-templates-title">
              <h2 id="flow-templates-title" className="text-xl font-extrabold text-ink">
                1. ¿Qué tipo de negocio es?
              </h2>
              <p className="mt-1 text-sm text-muted">
                Una plantilla llena las opciones de abajo. No se guarda nada hasta que pulses «Guardar flujo».
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FLOW_TEMPLATES.map((option) => {
                  const selected = template?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSaved(false);
                        setReview(null);
                        apply.reset();
                        setDraft({ ...option.settings, entrega_en_espacio: settings?.entrega_en_espacio ?? 'mesa' });
                      }}
                      className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${
                        selected ? 'border-ink bg-lime' : 'border-ink/15 bg-cream hover:border-ink/40'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-extrabold text-ink">
                        {option.label}
                        {selected && <Check aria-hidden="true" className="size-4" />}
                      </span>
                      <span className="text-xs leading-5 text-muted">{option.description}</span>
                    </button>
                  );
                })}
              </div>
              {settings && !template && (
                <p className="mt-3 text-xs leading-5 text-muted">
                  Tus opciones no coinciden con una plantilla: es un flujo personalizado (
                  {BUSINESS_TYPE_LABELS[settings.tipo]}).
                </p>
              )}
            </section>

            {settings && (
              <>
                <section className="panel-card grid gap-6 p-5 sm:p-6" aria-labelledby="flow-custom-title">
                  <div>
                    <h2 id="flow-custom-title" className="text-xl font-extrabold text-ink">
                      2. Personaliza
                    </h2>
                    <p className="mt-1 text-sm text-muted">Cada opción cambia el flujo de abajo al instante.</p>
                  </div>
                  <div className="grid gap-2">
                    <p className="field__label">¿Cuándo pagan?</p>
                    <Choice
                      name="¿Cuándo pagan?"
                      value={settings.permite_pago_al_final}
                      onChange={(value) => change({ permite_pago_al_final: value })}
                      options={[
                        {
                          value: false,
                          label: 'Al pedir',
                          hint: 'Pagan con saldo, tarjeta o efectivo antes de que se prepare.',
                        },
                        {
                          value: true,
                          label: 'Al final, con cuenta abierta',
                          hint: 'Piden varias rondas en su mesa o cancha y pagan todo al irse.',
                        },
                      ]}
                    />
                  </div>
                  <div className="grid gap-2">
                    <p className="field__label">¿Permitir pagos con saldo / cartera?</p>
                    <Choice
                      name="¿Permitir pagos con saldo?"
                      value={settings.permite_saldo ?? true}
                      onChange={(value) => change({ permite_saldo: value })}
                      options={[
                        {
                          value: true,
                          label: 'Sí, permitir saldo',
                          hint: 'Los clientes pueden recargar y pagar usando su cartera Vaiinilla.',
                        },
                        {
                          value: false,
                          label: 'Desactivar saldo',
                          hint: 'Solo se puede desactivar si ningún cliente tiene saldo a favor acumulado en el negocio.',
                        },
                      ]}
                    />
                  </div>
                  <div className="grid gap-2">
                    <p className="field__label">¿Cómo se entrega?</p>
                    <Choice
                      name="¿Cómo se entrega?"
                      value={settings.entrega_requiere_qr}
                      onChange={(value) => change({ entrega_requiere_qr: value })}
                      options={[
                        {
                          value: true,
                          label: 'Escanear QR para pedidos para llevar',
                          hint: 'En una sesión abierta de mesa, el pedido se entrega sin QR.',
                        },
                        {
                          value: false,
                          label: 'Entregar sin QR',
                          hint: 'Aplica también a pedidos para llevar. En mesa con sesión abierta nunca se exige QR.',
                        },
                      ]}
                    />
                  </div>
                  <div className="grid gap-2">
                    <p className="field__label">¿Cómo llega un pedido hecho en mesa?</p>
                    <Choice<NonNullable<FlowSettings['entrega_en_espacio']>>
                      name="¿Cómo llega un pedido hecho en mesa?"
                      value={settings.entrega_en_espacio ?? 'mesa'}
                      onChange={(value) => change({ entrega_en_espacio: value })}
                      options={[
                        { value: 'mesa', label: SPACE_DELIVERY_LABELS.mesa, hint: 'El mesero lleva el pedido a la mesa.' },
                        { value: 'barra', label: SPACE_DELIVERY_LABELS.barra, hint: 'El cliente pasa por su pedido a la barra; lo entrega Caja.' },
                        { value: 'ambas', label: SPACE_DELIVERY_LABELS.ambas, hint: 'Al pagar, el cliente elige si se lo llevan o pasa por él.' },
                      ]}
                    />
                  </div>
                  <div className="max-w-xs">
                    <Field
                      label="Gracia al terminar un turno (minutos)"
                      name="grace-minutes"
                      type="number"
                      min={0}
                      max={MAX_GRACE_MINUTES}
                      value={Number.isNaN(settings.gracia_liberacion_min) ? '' : settings.gracia_liberacion_min}
                      onChange={(event) => change({ gracia_liberacion_min: event.target.valueAsNumber })}
                      error={graceValid ? undefined : `Escribe un número entero de 0 a ${MAX_GRACE_MINUTES}.`}
                      hint="Tiempo para renovar o liberar una cancha o mesa después de que termina su turno."
                    />
                  </div>
                  <div className="grid gap-2">
                    <p className="field__label">¿Cuándo se reciben pedidos?</p>
                    <Choice
                      name="¿Cuándo se reciben pedidos?"
                      value={settings.franjas_pedido.length > 0}
                      onChange={(limited) =>
                        change({ franjas_pedido: limited ? [{ desde: '12:00', hasta: '15:00' }] : [] })
                      }
                      options={[
                        { value: false, label: 'A cualquier hora', hint: 'Mientras el negocio esté abierto.' },
                        {
                          value: true,
                          label: 'Solo en ciertas horas',
                          hint: 'Útil en un comedor o un evento: fuera de las franjas no entran pedidos.',
                        },
                      ]}
                    />
                    {settings.franjas_pedido.length > 0 && (
                      <div className="grid gap-2 rounded-2xl bg-cream p-4">
                        {settings.franjas_pedido.map((slot, index) => (
                          <div key={index} className="flex flex-wrap items-end gap-3">
                            <Field
                              label={`Franja ${index + 1}: desde`}
                              name={`slot-from-${index}`}
                              type="time"
                              value={slot.desde}
                              onChange={(event) =>
                                change({
                                  franjas_pedido: settings.franjas_pedido.map((item, i) =>
                                    i === index ? { ...item, desde: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                            <Field
                              label={`Franja ${index + 1}: hasta`}
                              name={`slot-to-${index}`}
                              type="time"
                              value={slot.hasta}
                              onChange={(event) =>
                                change({
                                  franjas_pedido: settings.franjas_pedido.map((item, i) =>
                                    i === index ? { ...item, hasta: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={`Quitar la franja ${index + 1}`}
                              onClick={() =>
                                change({ franjas_pedido: settings.franjas_pedido.filter((_, i) => i !== index) })
                              }
                            >
                              Quitar
                            </Button>
                          </div>
                        ))}
                        {slotsError && (
                          <p className="field__error" role="alert">
                            {slotsError}
                          </p>
                        )}
                        {settings.franjas_pedido.length < MAX_FRANJAS && (
                          <div>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                change({
                                  franjas_pedido: [...settings.franjas_pedido, { desde: '18:00', hasta: '20:00' }],
                                })
                              }
                            >
                              Agregar otra franja
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="flex items-center gap-2 text-xs leading-5 text-muted">
                    <Link2 aria-hidden="true" className="size-4 shrink-0" />
                    <span>
                      El precio por hora, el horario de reservas, las canchas y las mesas se configuran en{' '}
                      <Link className="font-bold text-ink underline" to="/app/espacios">
                        Mesas y espacios
                      </Link>
                      .
                    </span>
                  </p>
                </section>

                <section className="panel-card p-5 sm:p-6" aria-labelledby="flow-preview-title">
                  <h2 id="flow-preview-title" className="text-xl font-extrabold text-ink">
                    3. Así funciona tu tienda
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {summary.works} pasos funcionan hoy
                    {summary.soon > 0 ? ` · ${summary.soon} más llegan pronto` : ''}.
                  </p>
                  <ol className="mt-4 grid gap-2">
                    {steps.map((step, index) => (
                      <li
                        key={`${index}-${step.text}`}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${
                          step.status === 'works'
                            ? 'bg-cream text-ink'
                            : 'border border-dashed border-ink/25 text-muted'
                        }`}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-extrabold text-white-warm">
                          {index + 1}
                        </span>
                        <span className="w-16 shrink-0 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">
                          {step.role}
                        </span>
                        <span className="flex-1 font-semibold">{step.text}</span>
                        {step.status === 'soon' && (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
                            <Clock3 aria-hidden="true" className="size-3.5" /> Próximamente
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>

                {review && (
                  <TransitionReviewPanel
                    review={review}
                    current={query.data ?? null}
                    applying={apply.isPending}
                    applyError={apply.error}
                    rechecking={save.isPending}
                    onApply={() => apply.mutate(review)}
                    onRecheck={recheck}
                    onCancel={() => {
                      setReview(null);
                      apply.reset();
                    }}
                  />
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    loading={save.isPending}
                    disabled={!changed || !valid || Boolean(review) || apply.isPending}
                    onClick={() => settings && save.mutate(settings)}
                  >
                    Guardar flujo
                  </Button>
                  {changed && (
                    <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                      Descartar cambios
                    </Button>
                  )}
                  <p className="text-xs leading-5 text-muted">
                    Cambiar el flujo no afecta las cuentas que ya están abiertas; aplica a los pedidos nuevos.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </StoreFlowEditorSheet>
    </div>
  );
}

/**
 * La revisión del cambio de tipo o modos: qué cambia, la versión revisada, si el servidor lo
 * permite y, si no, los motivos y las operaciones vivas. Confirmar aplica una vez con la llave de
 * esta revisión; un 409 de versión pide volver a revisar en lugar de reenviar a ciegas.
 */
function TransitionReviewPanel({
  review,
  current,
  applying,
  applyError,
  rechecking,
  onApply,
  onRecheck,
  onCancel,
}: {
  review: TransitionReview;
  current: BusinessSettings | null;
  applying: boolean;
  applyError: unknown;
  rechecking: boolean;
  onApply: () => void;
  onRecheck: () => void;
  onCancel: () => void;
}) {
  const { preflight, transition } = review;
  const blocked = transitionBlockDetails(applyError);
  const versionConflict = isVersionConflict(applyError);
  const notFound = isNotFound(applyError);
  const needsRecheck = !preflight.permitido || Boolean(blocked) || versionConflict;
  return (
    <section className="panel-card grid gap-3 p-5 sm:p-6" aria-labelledby="flow-transition-title">
      <h2 id="flow-transition-title" className="text-xl font-extrabold text-ink">
        Revisa el cambio antes de aplicarlo
      </h2>
      <p className="text-sm text-muted">
        Cambiar el tipo o la forma de operar se revisa primero con el servidor. Versión revisada: {preflight.version_actual}.
      </p>
      <ul className="grid gap-1 text-sm" aria-label="Cambios de tipo o modo">
        {Object.entries(transition).map(([field, value]) => (
          <li key={field}>
            <strong>{TRANSITION_FIELD_LABELS[field] ?? field}:</strong>{' '}
            {current ? `${transitionValue(field, (current as unknown as Record<string, unknown>)[field])} → ` : ''}
            {transitionValue(field, value)}
          </li>
        ))}
      </ul>
      {Object.keys(review.ordinary).length > 0 && (
        <p className="text-xs text-muted">Los demás ajustes del flujo se guardan junto con este cambio.</p>
      )}
      {preflight.permitido && !blocked && !versionConflict && (
        <Feedback tone="success">El servidor permite el cambio. Confirma para aplicarlo.</Feedback>
      )}
      {!preflight.permitido && (
        <Feedback tone="error">
          No se puede aplicar todavía.
          <BlockList
            reasons={preflight.reason_codes}
            operations={preflight.operaciones?.items ?? []}
            total={preflight.operaciones?.total ?? 0}
          />
        </Feedback>
      )}
      {blocked && (
        <Feedback tone="error">
          El servidor bloqueó el cambio al aplicarlo; no se guardó nada.
          <BlockList reasons={blocked.reason_codes} operations={blocked.operaciones} total={blocked.total} />
        </Feedback>
      )}
      {versionConflict && (
        <Feedback tone="error">
          La configuración cambió en otra sesión desde la revisión; no se guardó nada. Vuelve a revisar el cambio.
        </Feedback>
      )}
      {notFound && (
        <Feedback tone="error">
          Este servidor todavía no tiene el cambio de tipo o modo (404). No se guardó nada; tus cambios siguen aquí.
        </Feedback>
      )}
      {Boolean(applyError) && !blocked && !versionConflict && !notFound && (
        <Feedback tone="error">{errorMessage(applyError)}</Feedback>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {needsRecheck ? (
          <Button type="button" loading={rechecking} onClick={onRecheck}>
            Volver a revisar
          </Button>
        ) : (
          <Button type="button" loading={applying} onClick={onApply}>
            Aplicar cambio
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={applying} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
