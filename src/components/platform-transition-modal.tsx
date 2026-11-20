import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Feedback, Modal, SelectField } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import type { ConfigTransitionPreflight, PlatformEstablishment } from '../types/api';
import { transitionBlockedMessage } from '../lib/config-transition';

const TRANSITION_TYPES = [
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'padel', label: 'Club de pádel' },
  { value: 'bar', label: 'Bar o cantina' },
  { value: 'food_truck', label: 'Food truck' },
  { value: 'drive_thru', label: 'Drive-thru' },
  { value: 'comedor', label: 'Comedor' },
  { value: 'evento', label: 'Evento' },
  { value: 'reposteria', label: 'Repostería' },
  { value: 'boliche', label: 'Boliche' },
];

export function PlatformTransitionModal({
  open,
  token,
  establishment,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  token: string;
  establishment: PlatformEstablishment | null;
  onOpenChange: (open: boolean) => void;
  onApplied: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<string>(establishment?.tipo ?? 'cafeteria');
  const [preflight, setPreflight] = useState<ConfigTransitionPreflight | null>(null);

  const checkMutation = useMutation({
    mutationFn: () => api.preflightPlatformTransition(token, establishment!.id, { tipo }),
    onSuccess: (res) => setPreflight(res),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      api.applyPlatformTransition(token, establishment!.id, { tipo }, preflight?.version_actual ?? 0, createIdempotencyKey()),
    onSuccess: async () => {
      setPreflight(null);
      await onApplied();
    },
  });

  if (!establishment) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Transición de configuración · ${establishment.nombre}`}
      description="Ejecuta el preflight del backend antes de aplicar el cambio de tipo o modo."
    >
      <div className="grid gap-3">
        {checkMutation.isError && <Feedback tone="error">{errorMessage(checkMutation.error)}</Feedback>}
        {applyMutation.isError && <Feedback tone="error">{errorMessage(applyMutation.error)}</Feedback>}
        <SelectField
          label="Nuevo tipo de establecimiento"
          value={tipo}
          onChange={(e) => { setPreflight(null); setTipo(e.target.value); }}
        >
          {TRANSITION_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </SelectField>
        {preflight && (
          <Feedback tone={preflight.permitido ? 'success' : 'error'}>
            {preflight.permitido
              ? 'Preflight aprobado: puedes aplicar la transición.'
              : transitionBlockedMessage(preflight)}
          </Feedback>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" loading={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
            Ejecutar preflight
          </Button>
          <Button
            type="button"
            disabled={!preflight?.permitido}
            loading={applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            Aplicar transición
          </Button>
        </div>
      </div>
    </Modal>
  );
}
