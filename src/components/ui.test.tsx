import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './ui';

describe('SelectField', () => {
  it('asocia etiqueta y ayuda, y permite seleccionar una opción', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SelectField
        name="zona_horaria"
        label="Zona horaria"
        hint="Selecciona la ciudad más cercana."
        defaultValue="America/Mexico_City"
        onChange={onChange}
      >
        <option value="America/Mexico_City">Ciudad de México</option>
        <option value="America/Tijuana">Tijuana</option>
      </SelectField>,
    );

    const select = screen.getByRole('combobox', { name: 'Zona horaria' });
    expect(select).toHaveAccessibleDescription('Selecciona la ciudad más cercana.');
    expect(select).toHaveValue('America/Mexico_City');

    await user.selectOptions(select, 'America/Tijuana');

    expect(select).toHaveValue('America/Tijuana');
    expect(onChange).toHaveBeenCalledOnce();
  });
});

it('Modal convencional conserva el autofocus del primer control y no inventa descripción', async () => {
  const { Modal } = await import('./ui');
  render(<Modal open onOpenChange={() => {}} title="Convencional"><label>Buscar<input /></label></Modal>);
  expect(screen.getByRole('button', { name: 'Cerrar ventana' })).toHaveFocus();
  expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
});
