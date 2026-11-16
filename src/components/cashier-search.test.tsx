import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
import { CashierSearch } from './cashier-search';

const order = (id: string, folio: number, nombre: string, estado: OrderDetail['estado'] = 'por_cobrar'): OrderDetail =>
  ({
    id,
    folio,
    estado,
    metodo_pago: 'efectivo',
    destino: 'para_llevar',
    espacio: null,
    saldo_pendiente: estado === 'listo' ? '0.00' : '50.00',
    creado_en: `2026-11-16T12:${String(folio).padStart(2, '0')}:00Z`,
    items: [],
    usuario: { nombre, matricula: null },
  }) as unknown as OrderDetail;

describe('hoja «¿Cuál es el tuyo?»', () => {
  it('filtra al escribir y abre el pedido elegido', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    const orders = [order('a', 11, 'Diego'), order('b', 12, 'Ana', 'listo')];
    render(<CashierSearch open onOpenChange={() => {}} orders={orders} onPick={onPick} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await user.type(screen.getByRole('searchbox'), 'dieg');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Abrir pedido 11' }));
    expect(onPick).toHaveBeenCalledWith(orders[0]);
  });

  it('el filtro «Listos» y un texto sin coincidencias lo dicen claro', async () => {
    const user = userEvent.setup();
    render(<CashierSearch open onOpenChange={() => {}} orders={[order('a', 11, 'Diego'), order('b', 12, 'Ana', 'listo')]} onPick={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Listos' }));
    expect(screen.getByRole('button', { name: 'Listos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Abrir pedido 12' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir pedido 11' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Ningún pedido de la fila coincide con «zzz».')).toBeInTheDocument();
  });
});
