import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KitchenOrderCard } from './kitchen-order-card';
import { OrderCard } from './order-card';
import type { OrderDetail } from '../types/api';

const order: OrderDetail = {
  id: 'o-1',
  folio: 7,
  fecha_operativa: '2026-09-30',
  estado: 'cobrado',
  metodo_pago: 'saldo',
  destino: 'para_llevar',
  espacio: null,
  subtotal: '90.00',
  ahorro_combinado: '0.00',
  cashback_otorgado: '0.00',
  total: '90.00',
  version: 2,
  creado_en: '2026-09-30T19:00:00.000Z',
  actualizado_en: '2026-09-30T19:00:00.000Z',
  notas_cocina: null,
  usuario: { nombre: 'Ana', matricula: null },
  items: [],
};

describe('"Ya llegó" del drive-thru', () => {
  it('cocina lo ve cuando el cliente avisó, con los minutos', () => {
    const now = new Date('2026-09-30T19:12:00.000Z').getTime();
    render(<KitchenOrderCard order={{ ...order, llegada_en: '2026-09-30T19:09:00.000Z' }} stage="pending" now={now} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ya llegó');
    expect(screen.getByRole('status')).toHaveTextContent('hace 3 min');
  });

  it('cocina no muestra nada si no ha avisado', () => {
    render(<KitchenOrderCard order={order} stage="pending" now={Date.now()} />);
    expect(screen.queryByText('Ya llegó')).not.toBeInTheDocument();
  });

  it('la caja lo ve en la tarjeta del pedido', () => {
    render(<OrderCard order={{ ...order, llegada_en: '2026-09-30T19:09:00.000Z' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ya llegó');
  });

  it('la caja no muestra nada sin aviso', () => {
    render(<OrderCard order={order} />);
    expect(screen.queryByText('Ya llegó')).not.toBeInTheDocument();
  });
});
