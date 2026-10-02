import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CardPaymentsCard } from '../components/card-payments-card';
import { Choice } from '../components/choice';
import { Button, Feedback, Field, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
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

const KNOWN_TYPES = Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[];

function toSettings(data: BusinessSettings): FlowSettings | null {
  const tipo = KNOWN_TYPES.find((known) => known === data.tipo);
  if (!tipo) return null;
  return {
    tipo,
    entrega_requiere_qr: data.entrega_requiere_qr,
    permite_pago_al_final: data.permite_pago_al_final,
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

  const query = useQuery({
    queryKey: ['business-settings', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.businessSettings(token),
  });
  const current = query.data ? toSettings(query.data) : null;
  const settings = draft ?? current;
  const save = useMutation({
    mutationFn: (input: FlowSettings) =>
      api.saveBusinessSettings(token, { ...input, franjas_pedido: sortFranjas(input.franjas_pedido) }),
    onSuccess: (data) => {
      // Mostrar ya lo guardado: si no, la página enseña un instante los datos viejos hasta recargar.
      queryClient.setQueryData(['business-settings', scopeId], data);
      setDraft(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
    },
  });

  function change(next: Partial<FlowSettings>) {
    if (!settings) return;
    setSaved(false);
    setDraft({ ...settings, ...next });
  }

  const changed = Boolean(settings && current && !sameSettings(settings, current));
  const slotsError = settings && settings.franjas_pedido.length > 0 ? franjasError(settings.franjas_pedido) : null;
  const valid = Boolean(settings && validGrace(settings.gracia_liberacion_min) && !slotsError);
  const template = settings ? matchingTemplate(settings) : null;
  const steps = settings ? buildFlow(settings) : [];
  const summary = flowSummary(steps);
  const unknownType = Boolean(query.data && !current);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operación del establecimiento"
        title="Flujo de mi tienda"
        description="Elige cómo funciona tu negocio: cuándo pagan, cómo se entrega y cuánto dura un turno. Abajo ves el flujo paso a paso, por rol."
      />
      {query.isError && <Feedback tone="error">{errorMessage(query.error)}</Feedback>}
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {saved && !save.isError && !changed && <Feedback tone="success">Flujo guardado. Ya aplica a los pedidos nuevos.</Feedback>}
      {unknownType && (
        <Feedback tone="error">
          Tu negocio tiene un tipo que esta pantalla no conoce ({query.data?.tipo}). Elige una plantilla para continuar.
        </Feedback>
      )}
      {query.isLoading && <div className="table-loading">Consultando tu negocio…</div>}

      <CardPaymentsCard token={token} scopeId={scopeId} />

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
                      setDraft({ ...option.settings });
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
                Tus opciones no coinciden con una plantilla: es un flujo personalizado ({BUSINESS_TYPE_LABELS[settings.tipo]}).
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
                      { value: false, label: 'Al pedir', hint: 'Pagan con saldo, tarjeta o efectivo antes de que se prepare.' },
                      {
                        value: true,
                        label: 'Al final, con cuenta abierta',
                        hint: 'Piden varias rondas en su mesa o cancha y pagan todo al irse.',
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
                      { value: true, label: 'Escaneando el QR del pedido', hint: 'Más control: quien entrega confirma que es el pedido correcto.' },
                      { value: false, label: 'Sin escanear nada', hint: 'Más rápido en mesa o cancha. Para llevar siempre se escanea.' },
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
                    error={valid ? undefined : `Escribe un número entero de 0 a ${MAX_GRACE_MINUTES}.`}
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
                              change({ franjas_pedido: [...settings.franjas_pedido, { desde: '18:00', hasta: '20:00' }] })
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
                        step.status === 'works' ? 'bg-cream text-ink' : 'border border-dashed border-ink/25 text-muted'
                      }`}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-extrabold text-white-warm">
                        {index + 1}
                      </span>
                      <span className="w-16 shrink-0 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">{step.role}</span>
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
    </div>
  );
}
