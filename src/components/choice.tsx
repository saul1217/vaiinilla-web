// Elegir entre opciones con su explicación (sí/no de un ajuste del negocio, o un modo).
export function Choice<T extends boolean | string = boolean>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
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
