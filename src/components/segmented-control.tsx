import { useId, useRef } from 'react';

export function SegmentedControl<T extends string>({ legend, value, options, onChange, disabled = false }: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const enabled = options.filter((option) => !option.disabled);
  const selected = enabled.some((option) => option.value === value) ? value : enabled[0]?.value;
  return <fieldset ref={root} className="app-segments" disabled={disabled} onKeyDown={(event) => {
    const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key) || !enabled.length || disabled) return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.value === value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + enabled.length) % enabled.length;
    const option = enabled[next]!;
    onChange(option.value);
    root.current?.querySelector<HTMLInputElement>(`input[data-index="${options.indexOf(option)}"]`)?.focus();
  }}>
    <legend className="sr-only">{legend}</legend>
    <div className="app-segments__options">
      {options.map((option, index) => <label key={option.value} className="app-segments__option">
        <input type="radio" name={name} value={option.value} data-index={index} checked={value === option.value}
          disabled={option.disabled} tabIndex={selected === option.value ? 0 : -1} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}
