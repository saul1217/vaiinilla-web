import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Choice } from './choice';
import { Button, Feedback, Field, SelectField } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { cashierLines } from '../lib/cashier-lines';
import type { BusinessSettings, BusinessSettingsInput } from '../types/api';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Filas para recoger (migración 222): repartir en orden entre las barras y la fila express para lo
 * pedido antes de una hora. Sin el back nuevo `reparto_filas` no viene y la tarjeta no aparece.
 */
export function StoreLinesCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  const queryClient = useQueryClient();
  const spaces = useQuery({ queryKey: ['spaces', scopeId], queryFn: () => api.spaces(token) });
  const lines = cashierLines(spaces.data ?? []);
  const [mode, setMode] = useState<'lugar' | 'turno'>(settings.reparto_filas ?? 'lugar');
  const [expressId, setExpressId] = useState<number | null>(settings.fila_express_espacio_id ?? null);
  // Una hora guardada sin fila express no sirve: se muestra vacía y se borra al guardar.
  const [cutoff, setCutoff] = useState(
    settings.fila_express_espacio_id == null ? '' : (settings.fila_express_hora_corte ?? ''),
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const trimmedCutoff = cutoff.trim();
  const cutoffInvalid = trimmedCutoff !== '' && !HORA.test(trimmedCutoff);
  const changes: BusinessSettingsInput = {};
  if (mode !== (settings.reparto_filas ?? 'lugar')) changes.reparto_filas = mode;
  if (expressId !== (settings.fila_express_espacio_id ?? null)) changes.fila_express_espacio_id = expressId;
  if (trimmedCutoff !== (settings.fila_express_hora_corte ?? '')) changes.fila_express_hora_corte = trimmedCutoff || null;
  const hasChanges = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => api.saveBusinessSettings(token, changes),
    // La tarjeta no se vuelve a montar al refrescar la configuración (su key no cambia): así el
    // aviso de guardado se queda a la vista. Lo escrito ya es lo guardado.
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings', scopeId], data);
      void queryClient.invalidateQueries({ queryKey: ['business-settings', scopeId] });
      setSavedNotice('Filas guardadas. Aplican a los pedidos nuevos.');
    },
  });

  if (settings.reparto_filas == null) return null;
  const touch = () => setSavedNotice(null);

  return (
    <section className="rounded-3xl border border-ink/10 bg-white-warm p-5 grid gap-4" aria-label="Filas para recoger">
      <div>
        <h3 className="text-base font-extrabold">Filas para recoger</h3>
        <p className="text-sm text-muted">
          Cada barra o drive-thru activo es una fila. El cliente ve en su app en qué fila formarse y su código de 4 dígitos.
        </p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {savedNotice && !save.isError && <Feedback tone="success">{savedNotice}</Feedback>}
      {spaces.isSuccess && lines.length === 0 && (
        <Feedback tone="info">Todavía no tienes barras. Crea una en Espacios con tipo «Barra» para cada fila.</Feedback>
      )}
      <Choice
        name="reparto_filas"
        value={mode === 'turno'}
        onChange={(v) => { touch(); setMode(v ? 'turno' : 'lugar'); }}
        options={[
          { value: true, label: 'Repartir en orden', hint: 'Pedido 1 a la barra 1, pedido 2 a la barra 2… Cada barra arma lo suyo antes de que lleguen.' },
          { value: false, label: 'Por el QR donde piden', hint: 'Cada pedido va a la barra cuyo QR escanearon. Lo de para llevar lo ven todas.' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Fila express"
          value={expressId == null ? '' : String(expressId)}
          onChange={(e) => {
            touch();
            const next = e.target.value ? Number(e.target.value) : null;
            setExpressId(next);
            // Sin fila express la hora de corte no aplica: se borra junto con ella.
            if (next == null) setCutoff('');
          }}
          hint="Recibe lo apartado y lo pedido antes de la hora de corte. Ya vacía, recibe pedidos como las demás."
        >
          <option value="">Sin fila express</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>{line.nombre}</option>
          ))}
        </SelectField>
        <Field
          label="Hora de corte de la express"
          placeholder="09:30"
          inputMode="numeric"
          value={cutoff}
          disabled={expressId == null}
          onChange={(e) => { touch(); setCutoff(e.target.value); }}
          error={cutoffInvalid ? 'Escribe la hora como 09:30.' : undefined}
          hint="Antes de esta hora, lo que pidan va a la express. Ej.: 09:30 si el receso es a las 10:00."
        />
      </div>
      <div>
        <Button type="button" loading={save.isPending} disabled={!hasChanges || cutoffInvalid} onClick={() => save.mutate()}>
          Guardar filas
        </Button>
      </div>
    </section>
  );
}
