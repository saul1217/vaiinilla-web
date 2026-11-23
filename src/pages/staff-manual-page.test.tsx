import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffManualPage } from './staff-manual-page';

vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { context: { rol: 'mesero' } } }) }));

describe('página «Paso a paso»', () => {
  it('abre el manual del rol, filtra por búsqueda y lee una guía paso a paso', async () => {
    const user = userEvent.setup();
    render(<StaffManualPage />);
    expect(screen.getByRole('heading', { name: 'Manual de Mesero' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar en el manual'), 'cancha');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /abro o alargo el turno de una cancha/ }));

    expect(screen.getByText('Cancha sin precio: abre un turno')).toBeInTheDocument();
    expect(screen.getByText('Turnos de cancha revisados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Manual/ }));
    expect(screen.getByRole('heading', { name: 'Manual de Mesero' })).toBeInTheDocument();
  });

  it('cambia al manual de Cocina', async () => {
    const user = userEvent.setup();
    render(<StaffManualPage />);
    await user.click(screen.getByRole('radio', { name: 'Cocina' }));
    expect(screen.getByRole('heading', { name: 'Manual de Cocina' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marco una comanda como lista/ })).toBeInTheDocument();
  });
});
