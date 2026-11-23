// «Sugerir alérgenos» en el producto (Expo `AllergenSuggestion`): el asistente lee nombre e
// ingredientes y propone etiquetas; se agregan una por una o todas, y se revisan antes de guardar.
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { allergenLabel, pendingAllergens } from '../lib/allergens';
import { Button, Feedback } from './ui';

export function AllergenSuggestion({
  token,
  productId,
  getInput,
  current,
  onUse,
}: {
  token: string;
  productId: number | null;
  /** Nombre e ingredientes como están escritos al tocar el botón. */
  getInput: () => { nombre: string; ingredientes: string; descripcion: string };
  /** Lo que ya dice el campo Alérgenos. */
  current: string;
  onUse: (labels: string[]) => void;
}) {
  const suggest = useMutation({
    mutationFn: () => {
      const input = getInput();
      return api.suggestAllergens(token, { ...input, productoId: productId });
    },
  });
  const result = suggest.data;
  const labels = result ? [...new Set(result.alergenos.map(allergenLabel))] : [];
  const pending = result ? pendingAllergens(current, result.alergenos) : [];

  return (
    <div className="allergen-suggestion">
      {result && (
        <div className="allergen-suggestion__card" role="status">
          <strong>Sugerencia del asistente</strong>
          <p>
            {labels.length === 0
              ? (result.motivo ?? 'No encontró alérgenos. Si estás seguro, márcalo tú.')
              : pending.length === 0
                ? 'Ya marcaste todo lo que sugirió.'
                : `${result.motivo ? `${result.motivo} ` : ''}Revísalo antes de guardar.`}
          </p>
          {pending.length > 0 && (
            <div className="allergen-suggestion__chips">
              {pending.map((label) => (
                <Button key={label} type="button" variant="secondary" onClick={() => onUse([label])}>+ {label}</Button>
              ))}
              {pending.length > 1 && <Button type="button" variant="dark" onClick={() => onUse(pending)}>Agregar todos</Button>}
            </div>
          )}
        </div>
      )}
      {suggest.isError && <Feedback tone="error">{errorMessage(suggest.error)}</Feedback>}
      <Button
        type="button"
        variant="secondary"
        loading={suggest.isPending}
        onClick={() => {
          if (!getInput().nombre.trim()) return;
          suggest.mutate();
        }}
      >
        <Sparkles aria-hidden="true" className="size-4" /> {suggest.isPending ? 'Revisando la receta…' : result ? 'Sugerir otra vez' : 'Sugerir alérgenos'}
      </Button>
    </div>
  );
}
