import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import { OrderCard } from './order-card';

const order = (over: Partial<OrderDetail> = {}) =>
  ({
    id: 'o1', folio: 21, estado: 'por_cobrar', metodo_pago: 'efectivo', destino: 'para_llevar', total: '60.00',
    items: [], version: 1, creado_en: '2026-10-02T20:00:00Z', usuario: { nombre: 'Lupita', matricula: null }, ...over,
  }) as unknown as OrderDetail;

describe('pedido de invitado en Caja', () => {
  it('se ve igual que los demás, marcado "Invitado"', () => {
    render(<OrderCard order={order({ invitado: true })} />);
    expect(screen.getByText('Lupita')).toBeInTheDocument();
    expect(screen.getByText('Invitado')).toBeInTheDocument();
  });

  it('un cliente con cuenta no lleva la marca', () => {
    render(<OrderCard order={order()} />);
    expect(screen.queryByText('Invitado')).not.toBeInTheDocument();
  });
});
