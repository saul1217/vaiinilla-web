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
import { VaiinillaApiError } from '../lib/api-error';
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
import type { BusinessSettings } from '../types/api';
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
  };
}

export function StoreFlowPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FlowSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [transitionType, setTransitionType] = useState('');
  const [transitionPreflight, setTransitionPreflight] = useState<import('../types/api').ConfigurationTransitionPreflight | null>(null);
  const [transitionUnavailable, setTransitionUnavailable] = useState(false);
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
  const save = useMutation({
    mutationFn: (input: FlowSettings) => {
      const flow = { ...input };
      delete (flow as Partial<FlowSettings>).tipo;
      return api.saveBusinessSettings(token, { ...flow, franjas_pedido: sortFranjas(input.franjas_pedido) });
    },
    onSuccess: (data) => {
      // Mostrar ya lo guardado: si no, la página enseña un instante los datos viejos hasta recargar.
      queryClient.setQueryData(['business-settings', scopeId], data);
      setDraft(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
    },
  });
  const transitionCheck = useMutation({
    mutationFn: () => api.preflightBusinessTransition(token, { cambios: { tipo: transitionType } }),
    onSuccess: (result) => { setTransitionPreflight(result); setTransitionUnavailable(false); },
    onError: (error) => { setTransitionPreflight(null); setTransitionUnavailable(error instanceof VaiinillaApiError && error.status === 404); },
  });
  const transitionApply = useMutation({
    mutationFn: () => {
      if (!transitionPreflight) throw new Error('Primero revisa la transición.');
      return api.applyBusinessTransition(token, { version_esperada: transitionPreflight.version_actual, cambios: { tipo: transitionType } });
    },
    onSuccess: async () => {
      setTransitionPreflight(null);
      await queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
    },
  });

  function change(next: Partial<FlowSettings>) {
    if (!settings) return;
    setSaved(false);
    setDraft({ ...settings, ...next });
  }

  const changed = Boolean(settings && current && !sameSettings(settings, current));
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
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {saved && !save.isError && !changed && (
        <Feedback tone="success">Flujo guardado. Ya aplica a los pedidos nuevos.</Feedback>
      )}
      {unknownType && (
        <Feedback tone="error">
          Tu negocio tiene un tipo desconocido ({query.data?.tipo}). Se aplica modo seguro: no se anuncian capacidades nuevas ni se ofrecen transiciones.
        </Feedback>
      )}
      {query.isLoading && <div className="table-loading">Consultando tu negocio…</div>}
      {query.data && (
        <section className="panel-card grid gap-3 p-5" aria-label="Contrato de capacidades v1">
          <h2 className="text-lg font-extrabold text-ink">Capacidades efectivas · contrato v1</h2>
          {query.data.contrato_v1 ? (
            <>
              {!query.data.contrato_v1.tipo_comercial_conocido && (
                <Feedback tone="error">Tipo no reconocido: UNKNOWN_TYPE_FAILSAFE. Capacidades nuevas desactivadas.</Feedback>
              )}
              <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                {Object.entries(query.data.contrato_v1.capacidades).map(([name, capability]) => (
                  <li key={name} className="flex justify-between gap-3">
                    <span>{name}</span><strong>{capability.enabled ? 'Disponible' : 'No disponible'}</strong>
                  </li>
                ))}
              </ul>
              {query.data.contrato_v1.capacidades.transicion_segura_hito2?.enabled === false && (
                <p className="text-sm text-muted">HITO2_NOT_IMPLEMENTED: el cambio de tipo no está habilitado en este hito.</p>
              )}
              {query.data.contrato_v1.ocultacion_producto.saldo_wallet?.visible === false && query.data.contrato_v1.ocultacion_producto.cashback?.visible === false && (
                <p className="text-sm text-muted">Saldo Vaiinilla y cashback permanecen ocultos.</p>
              )}
            </>
          ) : (
            <Feedback tone="info">El servidor no envió contrato_v1; fallback seguro: todas las capacidades nuevas se consideran desactivadas.</Feedback>
          )}
          {query.data.catalogo_tipos ? (
            query.data.catalogo_tipos.tipos.length ? (
              <p className="text-sm text-muted">Catálogo v{query.data.catalogo_tipos.version}: {query.data.catalogo_tipos.tipos.length} tipos.</p>
            ) : <Feedback tone="info">Catálogo de tipos vacío; no se ofrecen tipos nuevos.</Feedback>
          ) : <Feedback tone="info">Catálogo de tipos no disponible; no se ofrecen tipos nuevos.</Feedback>}
          {current && query.data.catalogo_tipos && (
            <div className="grid gap-3 border-t border-ink/10 pt-4">
              <h3 className="font-bold text-ink">Cambiar tipo de establecimiento</h3>
              <p className="text-sm text-muted">La revisión es de solo lectura. El cambio requiere preflight permitido y conserva la configuración actual.</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-56 gap-1 text-sm">Nuevo tipo
                  <select className="rounded-xl border border-ink/20 bg-white px-3 py-2" value={transitionType} onChange={(event) => { setTransitionType(event.target.value); setTransitionPreflight(null); }}>
                    <option value="">Selecciona un tipo</option>
                    {query.data.catalogo_tipos.tipos.filter((option) => option.seleccion_permitida && option.tipo !== current.tipo).map((option) => <option key={option.tipo} value={option.tipo}>{option.etiqueta}</option>)}
                  </select>
                </label>
                <Button disabled={!transitionType || transitionCheck.isPending} onClick={() => transitionCheck.mutate()}>{transitionCheck.isPending ? 'Revisando…' : 'Revisar transición'}</Button>
                {transitionPreflight?.permitido && <Button disabled={transitionApply.isPending} onClick={() => transitionApply.mutate()}>{transitionApply.isPending ? 'Aplicando…' : 'Aplicar cambio'}</Button>}
              </div>
              {transitionUnavailable && <Feedback tone="info">La transición no está disponible en este servidor (404). Actualiza el backend con los endpoints del contrato Hito 2.</Feedback>}
              {transitionCheck.isError && !transitionUnavailable && <Feedback tone="error">{errorMessage(transitionCheck.error)}</Feedback>}
              {transitionPreflight && <div className="grid gap-2 text-sm"><Feedback tone={transitionPreflight.permitido ? 'success' : 'error'}>{transitionPreflight.permitido ? 'Transición permitida.' : 'Transición bloqueada.'} Versión actual: {transitionPreflight.version_actual}. {transitionPreflight.reason_codes.join(', ')}</Feedback>{transitionPreflight.bloqueos.map((block, index) => <p key={`${block.code}-${index}`} className="text-muted">{block.code}: {block.message}</p>)}<details><summary className="cursor-pointer font-semibold">Capacidades resultantes</summary><pre className="mt-2 overflow-auto rounded-xl bg-cream p-3 text-xs">{JSON.stringify(transitionPreflight.capacidades_resultantes, null, 2)}</pre></details></div>}
              {transitionApply.isError && !(transitionApply.error instanceof VaiinillaApiError && transitionApply.error.status === 404) && <Feedback tone="error">{transitionApply.error instanceof VaiinillaApiError && transitionApply.error.code === 'CONFIG_VERSION_CONFLICT' ? 'La configuración cambió desde la revisión. Recarga la configuración e inténtalo de nuevo.' : transitionApply.error instanceof VaiinillaApiError && transitionApply.error.code === 'CONFIG_TRANSITION_BLOCKED' ? `El servidor bloqueó el cambio: ${JSON.stringify(transitionApply.error.details ?? transitionPreflight?.bloqueos ?? [])}` : errorMessage(transitionApply.error)}</Feedback>}
              {transitionApply.isError && transitionApply.error instanceof VaiinillaApiError && transitionApply.error.code === 'CONFIG_VERSION_CONFLICT' && <Button onClick={() => { setTransitionPreflight(null); void query.refetch(); }}>Recargar configuración</Button>}
              {transitionApply.isError && transitionApply.error instanceof VaiinillaApiError && transitionApply.error.status === 404 && <Feedback tone="info">La aplicación de transiciones no está disponible en este servidor (404).</Feedback>}
            </div>
          )}
        </section>
      )}

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
        {settings && (
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
                  const typeLocked = option.settings.tipo !== current?.tipo;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={typeLocked}
                      onClick={() => {
                        setSaved(false);
                        setDraft({ ...option.settings });
                      }}
                      className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${
                        selected ? 'border-ink bg-lime' : typeLocked ? 'cursor-not-allowed border-ink/10 bg-cream opacity-50' : 'border-ink/15 bg-cream hover:border-ink/40'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-extrabold text-ink">
                        {option.label}
                        {selected && <Check aria-hidden="true" className="size-4" />}
                      </span>
                      <span className="text-xs leading-5 text-muted">{typeLocked ? 'Para cambiar de tipo, usa el preflight de transición.' : option.description}</span>
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

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    loading={save.isPending}
                    disabled={!changed || !valid}
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
