import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Choice } from './choice';
import { Button, Feedback, Field, SelectField } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import type { BusinessSettings, BusinessSettingsInput, ConfigTransitionPreflight } from '../types/api';

const DELIVERY_SPACE_OPTIONS = [
  { value: 'mesa', label: 'En mesa o espacio (el mesero lleva el pedido)' },
  { value: 'barra', label: 'Recogen en barra (el cliente pasa por él)' },
  { value: 'ambas', label: 'El cliente elige (mesa o barra al pedir)' },
];

export function StoreOperationsCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  const queryClient = useQueryClient();
  const [barraPrepara, setBarraPrepara] = useState(settings.barra_prepara === true);
  const [cajaEntrega, setCajaEntrega] = useState(settings.caja_entrega_en_espacio === true);
  const [cocinaSinCobrar, setCocinaSinCobrar] = useState(settings.cocina_prepara_sin_cobrar !== false);
  const [pagoEnCaja, setPagoEnCaja] = useState(settings.permite_pago_en_caja !== false);
  const [entregaEnEspacio, setEntregaEnEspacio] = useState<'mesa' | 'barra' | 'ambas'>(settings.entrega_en_espacio ?? 'mesa');
  const [fondoSugerido, setFondoSugerido] = useState(settings.fondo_sugerido ?? '');
  const [horaInicioDia, setHoraInicioDia] = useState(settings.hora_inicio_dia ?? '00:00');
  const [modoEscuela, setModoEscuela] = useState(settings.modo_escuela === true);
  const [preflight, setPreflight] = useState<ConfigTransitionPreflight | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const transitionChanges: Record<string, unknown> = {};
  if (barraPrepara !== (settings.barra_prepara === true)) transitionChanges.barra_prepara = barraPrepara;
  if (cocinaSinCobrar !== (settings.cocina_prepara_sin_cobrar !== false)) transitionChanges.cocina_prepara_sin_cobrar = cocinaSinCobrar;
  if (pagoEnCaja !== (settings.permite_pago_en_caja !== false)) transitionChanges.permite_pago_en_caja = pagoEnCaja;
  if (entregaEnEspacio !== (settings.entrega_en_espacio ?? 'mesa')) transitionChanges.entrega_en_espacio = entregaEnEspacio;

  const patchChanges: BusinessSettingsInput = {};
  if (cajaEntrega !== (settings.caja_entrega_en_espacio === true)) patchChanges.caja_entrega_en_espacio = cajaEntrega;
  if (modoEscuela !== (settings.modo_escuela === true)) patchChanges.modo_escuela = modoEscuela;
  const trimmedFondo = fondoSugerido.trim();
  const currentFondo = settings.fondo_sugerido ?? '';
  if (trimmedFondo !== currentFondo) patchChanges.fondo_sugerido = trimmedFondo || null;
  const trimmedHora = horaInicioDia.trim() || '00:00';
  if (trimmedHora !== (settings.hora_inicio_dia ?? '00:00')) patchChanges.hora_inicio_dia = trimmedHora;

  const hasTransition = Object.keys(transitionChanges).length > 0;
  const hasPatch = Object.keys(patchChanges).length > 0;
  const hasChanges = hasTransition || hasPatch;

  const save = useMutation({
    mutationFn: async () => {
      let latest: BusinessSettings = settings;
      if (hasTransition) {
        const check = await api.preflightBusinessTransition(token, transitionChanges);
        setPreflight(check);
        if (!check.permitido) {
          const reason = check.bloqueadores?.map((b) => b.mensaje || b.codigo).filter(Boolean).join(' · ');
          throw new Error(reason || 'Hay operaciones activas que impiden cambiar el modo operativo ahora.');
        }
        latest = await api.applyBusinessTransition(token, transitionChanges, createIdempotencyKey());
      }
      if (hasPatch) {
        latest = await api.saveBusinessSettings(token, patchChanges);
      }
      return latest;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings', scopeId], data);
      void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
      setSavedNotice('Ajustes operativos guardados.');
    },
  });

  return (
    <section className="rounded-3xl border border-ink/10 bg-white-warm p-5 grid gap-4" aria-label="Operación avanzada">
      <div>
        <h3 className="text-base font-extrabold">Operación de Caja, Cocina y cortes</h3>
        <p className="text-sm text-muted">Los cambios de modo operativo se validan con preflight antes de aplicarse.</p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {savedNotice && !save.isError && <Feedback tone="success">{savedNotice}</Feedback>}
      {preflight && preflight.advertencias && preflight.advertencias.length > 0 && (
        <Feedback tone="info">{preflight.advertencias.map((a) => a.mensaje || a.codigo).filter(Boolean).join(' · ')}</Feedback>
      )}
      <Choice
        name="barra_prepara"
        value={barraPrepara}
        onChange={(v) => { setSavedNotice(null); setBarraPrepara(v); }}
        options={[
          { value: true, label: 'Barra/Caja prepara pedidos', hint: 'Caja prepara y avisa listo sin pasar por Cocina.' },
          { value: false, label: 'Prepara Cocina', hint: 'Los pedidos pasan por la pantalla de Cocina.' },
        ]}
      />
      <Choice
        name="caja_entrega_en_espacio"
        value={cajaEntrega}
        onChange={(v) => { setSavedNotice(null); setCajaEntrega(v); }}
        options={[
          { value: true, label: 'Caja también entrega en mesa/espacio', hint: 'El cajero puede marcar entregados los pedidos en mesa.' },
          { value: false, label: 'Solo Mesero entrega en mesa/espacio', hint: 'Caja solo entrega lo que se recoge en barra.' },
        ]}
      />
      <Choice
        name="cocina_prepara_sin_cobrar"
        value={cocinaSinCobrar}
        onChange={(v) => { setSavedNotice(null); setCocinaSinCobrar(v); }}
        options={[
          { value: true, label: 'Cocina prepara antes de cobrar', hint: 'Las comandas entran a Cocina aunque falte el cobro.' },
          { value: false, label: 'Cocina prepara solo cobrados', hint: 'Primero se cobra en Caja o con tarjeta/saldo.' },
        ]}
      />
      <Choice
        name="permite_pago_en_caja"
        value={pagoEnCaja}
        onChange={(v) => { setSavedNotice(null); setPagoEnCaja(v); }}
        options={[
          { value: true, label: 'Permitir pago en Caja', hint: 'El cliente puede pagar en efectivo o mostrador.' },
          { value: false, label: 'Solo pago digital', hint: 'Solo tarjeta o saldo Vaiinilla.' },
        ]}
      />
      <SelectField
        label="Entrega en mesa o espacio"
        value={entregaEnEspacio}
        onChange={(e) => { setSavedNotice(null); setEntregaEnEspacio(e.target.value as 'mesa' | 'barra' | 'ambas'); }}
      >
        {DELIVERY_SPACE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Fondo inicial sugerido de Caja ($)"
          inputMode="decimal"
          placeholder="Ej. 500.00"
          value={fondoSugerido}
          onChange={(e) => { setSavedNotice(null); setFondoSugerido(e.target.value); }}
        />
        <Field
          label="Inicio del día para el corte (00:00–12:00)"
          placeholder="00:00"
          value={horaInicioDia}
          onChange={(e) => { setSavedNotice(null); setHoraInicioDia(e.target.value); }}
          hint="Útil para bares o negocios que cierran de madrugada."
        />
      </div>
      <Choice
        name="modo_escuela"
        value={modoEscuela}
        onChange={(v) => { setSavedNotice(null); setModoEscuela(v); }}
        options={[
          { value: true, label: 'Modo escuela activado', hint: 'Habilita padrón de alumnos, tutores y menú por día.' },
          { value: false, label: 'Modo escuela desactivado', hint: 'Operación estándar sin padrón escolar.' },
        ]}
      />
      <div>
        <Button type="button" loading={save.isPending} disabled={!hasChanges} onClick={() => save.mutate()}>
          Guardar ajustes operativos
        </Button>
      </div>
    </section>
  );
}
