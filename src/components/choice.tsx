// Elegir una opción con su explicación (sí/no de un ajuste del negocio, o un modo de varios).
export function Choice<T extends string | boolean>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  const columns = options.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <div className={`grid gap-2 ${columns}`} role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border p-4 text-left transition ${
              selected ? 'border-ink bg-lime text-ink' : 'border-ink/15 bg-cream text-ink hover:border-ink/40'
            } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-ink/15`}
          >
            <span className="block text-sm font-extrabold">{option.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
