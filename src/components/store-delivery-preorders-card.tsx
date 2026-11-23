import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Choice } from './choice';
import { Button, Feedback, Field } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { BusinessSettings, BusinessSettingsInput } from '../types/api';

function optionalInt(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isInteger(n) ? n : null;
}

export function StoreDeliveryPreordersCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  const queryClient = useQueryClient();
  const [diasAdelanto, setDiasAdelanto] = useState(String(settings.dias_adelanto_pedido ?? 0));
  const [horaCorte, setHoraCorte] = useState(settings.hora_corte_pedido ?? '');
  const [anticipo, setAnticipo] = useState(settings.anticipo_porcentaje != null ? String(settings.anticipo_porcentaje) : '');
  const [requiereAceptar, setRequiereAceptar] = useState(settings.encargos_requieren_aceptar === true);
  const [minutosAceptar, setMinutosAceptar] = useState(settings.encargos_minutos_aceptar != null ? String(settings.encargos_minutos_aceptar) : '');

  const [repartoActivo, setRepartoActivo] = useState(settings.reparto_activo === true);
  const [repartoCosto, setRepartoCosto] = useState(settings.reparto_costo ?? '');
  const [repartoMinimo, setRepartoMinimo] = useState(settings.reparto_minimo ?? '');
  const [repartoRadio, setRepartoRadio] = useState(settings.reparto_radio_km ?? '');
  const [contraEntrega, setContraEntrega] = useState(settings.permite_contra_entrega === true);
  const [datosTransferencia, setDatosTransferencia] = useState(settings.datos_transferencia ?? '');
  const [telefonoContacto, setTelefonoContacto] = useState(settings.telefono_contacto ?? '');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  // El back acepta de 15 minutos a 2 días (2880). Se avisa aquí, con palabras, antes de guardar.
  const minutos = optionalInt(minutosAceptar);
  const minutosError =
    requiereAceptar && minutosAceptar.trim() !== '' && (minutos === null || minutos < 15 || minutos > 2880)
      ? 'Escribe de 15 a 2880 minutos (2 días), o déjalo vacío para no poner límite.'
      : undefined;

  const save = useMutation({
    mutationFn: () => {
      const days = Math.max(0, Math.min(14, Number.parseInt(diasAdelanto || '0', 10) || 0));
      const payload: BusinessSettingsInput = {
        dias_adelanto_pedido: days,
        hora_corte_pedido: horaCorte.trim() || null,
        anticipo_porcentaje: optionalInt(anticipo),
        encargos_requieren_aceptar: requiereAceptar,
        encargos_minutos_aceptar: requiereAceptar ? optionalInt(minutosAceptar) : null,
        reparto_activo: repartoActivo,
        reparto_costo: repartoCosto.trim() || null,
        reparto_minimo: repartoMinimo.trim() || null,
        reparto_radio_km: repartoRadio.trim() || null,
        permite_contra_entrega: contraEntrega,
        datos_transferencia: datosTransferencia.trim() || null,
        telefono_contacto: telefonoContacto.trim() || null,
      };
      return api.saveBusinessSettings(token, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings', scopeId], data);
      void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
      setSavedNotice('Reglas de encargos y reparto guardadas.');
    },
  });

  return (
    <section id="ajuste-encargos" tabIndex={-1} className="rounded-3xl border border-ink/10 bg-white-warm p-5 grid gap-4" aria-label="Encargos y reparto a domicilio">
      <div>
        <h3 className="text-base font-extrabold">Encargos con fecha y reparto a domicilio</h3>
        <p className="text-sm text-muted">Disponible para cualquier negocio: apartados para otros días y entrega a domicilio.</p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {savedNotice && !save.isError && <Feedback tone="success">{savedNotice}</Feedback>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Días de anticipación (0–14)"
          inputMode="numeric"
          value={diasAdelanto}
          onChange={(e) => { setSavedNotice(null); setDiasAdelanto(e.target.value); }}
          hint="0 = solo hoy."
        />
        <Field
          label="Hora de corte (HH:MM)"
          placeholder="Ej. 18:00"
          value={horaCorte}
          onChange={(e) => { setSavedNotice(null); setHoraCorte(e.target.value); }}
        />
        <Field
          label="Anticipo % (10–90)"
          inputMode="numeric"
          placeholder="Sin anticipo"
          value={anticipo}
          onChange={(e) => { setSavedNotice(null); setAnticipo(e.target.value); }}
        />
      </div>

      <Choice
        name="encargos_requieren_aceptar"
        value={requiereAceptar}
        onChange={(v) => { setSavedNotice(null); setRequiereAceptar(v); }}
        options={[
          { value: true, label: 'Encargos requieren aceptación', hint: 'El negocio acepta o rechaza cada encargo en Reparto.' },
          { value: false, label: 'Encargos entran directo', hint: 'No requieren aprobación manual.' },
        ]}
      />
      {requiereAceptar && (
        <Field
          label="Minutos límite para aceptar un encargo"
          inputMode="numeric"
          placeholder="Ej. 60"
          value={minutosAceptar}
          onChange={(e) => { setSavedNotice(null); setMinutosAceptar(e.target.value); }}
          error={minutosError}
          hint="De 15 minutos a 2 días. Si nadie contesta a tiempo, el encargo se cancela solo."
        />
      )}

      <Choice
        name="reparto_activo"
        value={repartoActivo}
        onChange={(v) => { setSavedNotice(null); setRepartoActivo(v); }}
        options={[
          { value: true, label: 'Entregas a domicilio activadas', hint: 'Los clientes pueden pedir envío a su dirección.' },
          { value: false, label: 'Entregas a domicilio desactivadas', hint: 'Solo consumo en el lugar o para recoger.' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Costo de envío ($)"
          inputMode="decimal"
          placeholder="Ej. 35.00"
          value={repartoCosto}
          onChange={(e) => { setSavedNotice(null); setRepartoCosto(e.target.value); }}
        />
        <Field
          label="Pedido mínimo ($)"
          inputMode="decimal"
          placeholder="Ej. 150.00"
          value={repartoMinimo}
          onChange={(e) => { setSavedNotice(null); setRepartoMinimo(e.target.value); }}
        />
        <Field
          label="Radio de reparto (km)"
          inputMode="decimal"
          placeholder="Sin límite"
          value={repartoRadio}
          onChange={(e) => { setSavedNotice(null); setRepartoRadio(e.target.value); }}
        />
      </div>
      <Choice
        name="permite_contra_entrega"
        value={contraEntrega}
        onChange={(v) => { setSavedNotice(null); setContraEntrega(v); }}
        options={[
          { value: true, label: 'Permitir pago contra entrega', hint: 'El repartidor cobra en la puerta.' },
          { value: false, label: 'Solo pago por adelantado', hint: 'El pedido debe quedar pagado antes de salir.' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Teléfono de contacto"
          placeholder="Ej. 6141234567"
          value={telefonoContacto}
          onChange={(e) => { setSavedNotice(null); setTelefonoContacto(e.target.value); }}
        />
        <Field
          label="Datos para transferencia"
          placeholder="CLABE / Banco / Titular"
          value={datosTransferencia}
          onChange={(e) => { setSavedNotice(null); setDatosTransferencia(e.target.value); }}
        />
      </div>
      <div>
        <Button type="button" loading={save.isPending} disabled={Boolean(minutosError)} onClick={() => save.mutate()}>
          Guardar encargos y reparto
        </Button>
      </div>
    </section>
  );
}
