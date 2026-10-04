import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TipPicker } from './tip-picker';

describe('TipPicker', () => {
  it('una propina mayor al total muestra el error del servidor en vivo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TipPicker
        base="30.00"
        value={{ kind: 'custom', amount: '50.00' }}
        onChange={onChange}
        error="La propina no puede ser mayor a lo que se cobra."
      />,
    );

    expect(screen.getByText('La propina no puede ser mayor a lo que se cobra.')).toBeInTheDocument();
    expect(screen.queryByText(/es del negocio y no paga comisión/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sin propina' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'none' });
  });

  it('sin error muestra el aviso de siempre', () => {
    render(
      <TipPicker base="30.00" value={{ kind: 'percent', percent: 15 }} onChange={vi.fn()} />,
    );
    expect(screen.getByText(/es del negocio y no paga comisión/)).toBeInTheDocument();
  });
});
