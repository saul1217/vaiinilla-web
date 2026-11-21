import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Choice } from './choice';
import { Button, Feedback, Field, SelectField } from './ui';
import { DEFAULT_KITCHEN_MIN, DEFAULT_NO_KITCHEN_MIN } from '../lib/delay-alerts';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { transitionBlockedMessage } from '../lib/config-transition';
import type { BusinessSettings, BusinessSettingsInput, ConfigTransitionPreflight } from '../types/api';

// Quién prepara: tres modos sobre dos banderas del back. Sin cocina exige que la barra prepare.
type PrepMode = 'cocina' | 'cocina_y_barra' | 'sin_cocina';

function prepModeOf(settings: BusinessSettings): PrepMode {
  if (settings.tiene_cocina === false) return 'sin_cocina';
  return settings.barra_prepara === true ? 'cocina_y_barra' : 'cocina';
}

const DELIVERY_SPACE_OPTIONS = [
  { value: 'mesa', label: 'En mesa o espacio (el mesero lleva el pedido)' },
  { value: 'barra', label: 'Recogen en barra (el cliente pasa por él)' },
  { value: 'ambas', label: 'El cliente elige (mesa o barra al pedir)' },
];

export function StoreOperationsCard({
  token,
  scopeId,
  settings,
  notice,
  onNotice,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
  /** Store flow remounts this card after each save (its key changes): the notice lives there so it survives. */
  notice?: string | null;
  onNotice?: (text: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [prepMode, setPrepMode] = useState<PrepMode>(prepModeOf(settings));
  // Un back sin la migración 223 no manda tiene_cocina: ahí no se ofrece «Sin cocina».
  const kitchenOptional = settings.tiene_cocina !== undefined;
  const barraPrepara = prepMode !== 'cocina';
  const tieneCocina = prepMode !== 'sin_cocina';
  const [cajaEntrega, setCajaEntrega] = useState(settings.caja_entrega_en_espacio === true);
  const [cocinaSinCobrar, setCocinaSinCobrar] = useState(settings.cocina_prepara_sin_cobrar !== false);
  const [pagoEnCaja, setPagoEnCaja] = useState(settings.permite_pago_en_caja !== false);
  const [entregaEnEspacio, setEntregaEnEspacio] = useState<'mesa' | 'barra' | 'ambas'>(settings.entrega_en_espacio ?? 'mesa');
  const [fondoSugerido, setFondoSugerido] = useState(settings.fondo_sugerido ?? '');
  const [horaInicioDia, setHoraInicioDia] = useState(settings.hora_inicio_dia ?? '00:00');
  const [modoEscuela, setModoEscuela] = useState(settings.modo_escuela === true);
  // Un back sin la migración 225 no manda cobro_requiere_codigo: ahí no se ofrece.
  const cobroCodigoDisponible = settings.cobro_requiere_codigo !== undefined;
  const [cobroCodigo, setCobroCodigo] = useState(settings.cobro_requiere_codigo === true);
  // Migración 228: un back sin ella manda null o nada y no se ofrecen.
  const cuentaDisponible = settings.cuenta_obligatoria != null;
  const [cuentaObligatoria, setCuentaObligatoria] = useState(settings.cuenta_obligatoria === true);
  const retrasoDisponible = settings.alerta_retraso_activa != null;
  const [retrasoActivo, setRetrasoActivo] = useState(settings.alerta_retraso_activa === true);
  const savedNoKitchen = String(settings.alerta_retraso_sin_cocina_min ?? DEFAULT_NO_KITCHEN_MIN);
  const savedKitchen = String(settings.alerta_retraso_cocina_min ?? DEFAULT_KITCHEN_MIN);
  const [retrasoSinCocina, setRetrasoSinCocina] = useState(savedNoKitchen);
  const [retrasoCocina, setRetrasoCocina] = useState(savedKitchen);
  const [preflight, setPreflight] = useState<ConfigTransitionPreflight | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const savedNotice = notice !== undefined ? notice : localNotice;
  const setSavedNotice = onNotice ?? setLocalNotice;

  const transitionChanges: Record<string, unknown> = {};
  if (barraPrepara !== (settings.barra_prepara === true)) transitionChanges.barra_prepara = barraPrepara;
  if (kitchenOptional && tieneCocina !== (settings.tiene_cocina !== false)) transitionChanges.tiene_cocina = tieneCocina;
  if (cocinaSinCobrar !== (settings.cocina_prepara_sin_cobrar !== false)) transitionChanges.cocina_prepara_sin_cobrar = cocinaSinCobrar;
  if (pagoEnCaja !== (settings.permite_pago_en_caja !== false)) transitionChanges.permite_pago_en_caja = pagoEnCaja;
  if (entregaEnEspacio !== (settings.entrega_en_espacio ?? 'mesa')) transitionChanges.entrega_en_espacio = entregaEnEspacio;

  const patchChanges: BusinessSettingsInput = {};
  if (cajaEntrega !== (settings.caja_entrega_en_espacio === true)) patchChanges.caja_entrega_en_espacio = cajaEntrega;
  if (modoEscuela !== (settings.modo_escuela === true)) patchChanges.modo_escuela = modoEscuela;
  if (cobroCodigoDisponible && cobroCodigo !== (settings.cobro_requiere_codigo === true)) patchChanges.cobro_requiere_codigo = cobroCodigo;
  if (cuentaDisponible && cuentaObligatoria !== (settings.cuenta_obligatoria === true)) patchChanges.cuenta_obligatoria = cuentaObligatoria;
  if (retrasoDisponible && retrasoActivo !== (settings.alerta_retraso_activa === true)) patchChanges.alerta_retraso_activa = retrasoActivo;
  const minutesProblem = (raw: string, max: number) =>
    /^\d+$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= max ? null : `Escribe un número de 1 a ${max}.`;
  const noKitchenProblem = retrasoDisponible && retrasoActivo ? minutesProblem(retrasoSinCocina, 120) : null;
  const kitchenProblem = retrasoDisponible && retrasoActivo ? minutesProblem(retrasoCocina, 240) : null;
  if (retrasoDisponible && !noKitchenProblem && retrasoSinCocina.trim() !== savedNoKitchen) patchChanges.alerta_retraso_sin_cocina_min = Number(retrasoSinCocina.trim());
  if (retrasoDisponible && !kitchenProblem && retrasoCocina.trim() !== savedKitchen) patchChanges.alerta_retraso_cocina_min = Number(retrasoCocina.trim());
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
        const blocked = transitionBlockedMessage(check);
        if (blocked) throw new Error(blocked);
        await api.applyBusinessTransition(token, transitionChanges, check.version_actual ?? 0, createIdempotencyKey());
        latest = await api.businessSettings(token);
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
    <section id="ajuste-operacion" tabIndex={-1} className="rounded-3xl border border-ink/10 bg-white-warm p-5 grid gap-4" aria-label="Operación avanzada">
      <div>
        <h3 className="text-base font-extrabold">Operación de Caja, Cocina y cortes</h3>
        <p className="text-sm text-muted">Los cambios de modo operativo se validan con preflight antes de aplicarse.</p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {savedNotice && !save.isError && <Feedback tone="success">{savedNotice}</Feedback>}
      {preflight && preflight.advertencias && preflight.advertencias.length > 0 && (
        <Feedback tone="info">{preflight.advertencias.map((a) => a.mensaje || a.codigo).filter(Boolean).join(' · ')}</Feedback>
      )}
      <Choice<PrepMode>
        name="Quién prepara"
        value={prepMode}
        onChange={(v) => { setSavedNotice(null); setPrepMode(v); }}
        options={[
          { value: 'cocina', label: 'Todo en Cocina', hint: 'Cada pedido entra a la pantalla de Cocina y ahí se marca listo.' },
          { value: 'cocina_y_barra', label: 'Cocina y barra', hint: 'La barra prepara bebidas y lo rápido; lo demás va a Cocina.' },
          ...(kitchenOptional
            ? [{ value: 'sin_cocina' as const, label: 'Sin cocina', hint: 'No hay Cocina: todo lo prepara la barra o Caja.' }]
            : []),
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
      {cobroCodigoDisponible && (
        <Choice
          name="cobro_requiere_codigo"
          value={cobroCodigo}
          onChange={(v) => { setSavedNotice(null); setCobroCodigo(v); }}
          options={[
            { value: false, label: 'Cobrar sin pedir código', hint: 'Caja cobra en efectivo cualquier pedido, como siempre.' },
            { value: true, label: 'Pedir el código del cliente al cobrar', hint: 'Lo pedido en la app se cobra con su QR, su código o su credencial, según cómo se entrega. Lo de mostrador no cambia.' },
          ]}
        />
      )}
      {cuentaDisponible && (
        <Choice
          name="cuenta_obligatoria"
          value={cuentaObligatoria}
          onChange={(v) => { setSavedNotice(null); setCuentaObligatoria(v); }}
          options={[
            { value: false, label: 'Se puede pedir sin cuenta', hint: 'El cliente pide como invitado con solo su nombre.' },
            { value: true, label: 'Pedir con cuenta', hint: 'Quita «pedir sin cuenta»: el cliente entra o crea su cuenta antes de pedir. Útil en escuelas.' },
          ]}
        />
      )}
      {retrasoDisponible && (
        <div className="grid gap-3">
          <Choice
            name="alerta_retraso_activa"
            value={retrasoActivo}
            onChange={(v) => { setSavedNotice(null); setRetrasoActivo(v); }}
            options={[
              { value: false, label: 'Sin aviso de pedidos que tardan', hint: 'Inicio no avisa de retrasos.' },
              { value: true, label: 'Avisar de pedidos pagados que tardan', hint: 'Inicio avisa cuando un pedido pagado pasa su límite sin entregarse.' },
            ]}
          />
          {retrasoActivo && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Límite sin cocina (min)"
                inputMode="numeric"
                value={retrasoSinCocina}
                onChange={(e) => { setSavedNotice(null); setRetrasoSinCocina(e.target.value); }}
                hint="De 1 a 120. Ej. una botella de agua."
                error={noKitchenProblem ?? undefined}
              />
              <Field
                label="Límite con cocina (min)"
                inputMode="numeric"
                value={retrasoCocina}
                onChange={(e) => { setSavedNotice(null); setRetrasoCocina(e.target.value); }}
                hint="De 1 a 240. Ej. un burrito."
                error={kitchenProblem ?? undefined}
              />
            </div>
          )}
        </div>
      )}
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
        <Button type="button" loading={save.isPending} disabled={!hasChanges || Boolean(noKitchenProblem || kitchenProblem)} onClick={() => save.mutate()}>
          Guardar ajustes operativos
        </Button>
      </div>
    </section>
  );
}
