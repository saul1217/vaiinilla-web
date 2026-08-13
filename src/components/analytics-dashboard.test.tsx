import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodSelector, RankedBarChart, SalesTrendChart } from './analytics-dashboard';

describe('analytics dashboard components', () => {
  it('permite elegir un periodo personalizado con límites coherentes', () => {
    const onChange = vi.fn();
    render(
      <PeriodSelector value={{ desde: '2026-08-01', hasta: '2026-08-12' }} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const desde = screen.getByLabelText('Desde');
    const hasta = screen.getByLabelText('Hasta');
    expect(desde).toHaveAttribute('max', '2026-08-12');
    expect(hasta).toHaveAttribute('min', '2026-08-01');

    fireEvent.change(desde, { target: { value: '2026-08-03' } });
    expect(onChange).toHaveBeenCalledWith({
      desde: '2026-08-03',
      hasta: '2026-08-12',
    });
  });

  it('expone la gráfica de ventas y una tabla de datos accesible', () => {
    render(
      <SalesTrendChart
        data={[
          { fecha: '2026-08-11', ventas: '120.00', pedidos: 3 },
          { fecha: '2026-08-12', ventas: '80.00', pedidos: 2 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: /Gráfica de ventas diarias/ })).toBeInTheDocument();
    expect(screen.getByText('5 pedidos')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
  });

  it('muestra el estado vacío sin inventar rankings', () => {
    render(
      <RankedBarChart
        eyebrow="Menú"
        title="Productos"
        items={[]}
        emptyMessage="Todavía no hay ventas."
      />,
    );
    expect(screen.getByText('Todavía no hay ventas.')).toBeInTheDocument();
  });
});
