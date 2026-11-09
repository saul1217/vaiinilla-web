import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge, Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from './vai';

describe('componentes base de Android', () => {
  it('el botón aplica su variante y se bloquea mientras carga', () => {
    const { rerender } = render(<VaiButton variant="coral">Llamar</VaiButton>);
    const button = screen.getByRole('button', { name: 'Llamar' });
    expect(button).toHaveClass('vai-button', 'vai-button--coral');
    expect(button).toHaveAttribute('type', 'button');
    rerender(<VaiButton variant="accent" loading>Llamar</VaiButton>);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('el chip anuncia si está elegido y avisa al tocarlo', async () => {
    const onClick = vi.fn();
    render(<ChipRow label="Filtros"><Chip selected onClick={onClick}>Hoy</Chip><Chip selected={false} onClick={onClick}>Semana</Chip></ChipRow>);
    expect(screen.getByRole('group', { name: 'Filtros' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('tarjeta, vacío, carga y contador', () => {
    render(<>
      <Card title="Saldo" description="Disponible">$100</Card>
      <VaiEmptyState icon={<svg />} title="Sin pedidos" message="Aquí verás los pedidos nuevos." action={<VaiButton>Crear</VaiButton>} />
      <LoadingState label="Cargando pedidos…" />
      <Badge count={120} label="120 productos en el carrito" />
      <Badge count={0} label="vacío" />
    </>);
    expect(screen.getByRole('heading', { name: 'Saldo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sin pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pedidos…');
    expect(screen.getByLabelText('120 productos en el carrito')).toHaveTextContent('99+');
    expect(screen.queryByLabelText('vacío')).not.toBeInTheDocument();
  });
});
