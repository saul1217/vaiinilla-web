// Elegir entre dos opciones con su explicación (sí/no de un ajuste del negocio).
export function Choice({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: boolean;
  options: { value: boolean; label: string; hint: string }[];
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border p-4 text-left transition ${
              selected ? 'border-ink bg-lime text-ink' : 'border-ink/15 bg-cream text-ink hover:border-ink/40'
            }`}
          >
            <span className="block text-sm font-extrabold">{option.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
