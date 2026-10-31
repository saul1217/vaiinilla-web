import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import { CashierQueue } from './cashier-queue';

const order = (id: string, folio: number): OrderDetail => ({ id, folio, estado: 'por_cobrar', destino: 'para_llevar', creado_en: '2026-10-30T12:00:00Z', total: '85.00', saldo_pendiente: '85.00', items: [], usuario: { nombre: 'Cliente', matricula: null } } as unknown as OrderDetail);
const a = order('a', 1), b = order('b', 2), c = order('c', 3);
const actions = (current: OrderDetail) => <button>Cobrar {current.folio}</button>;
it('mantiene selección por ID al actualizar y muestra un solo árbol de acciones', async () => {
  const { rerender } = render(<CashierQueue cashOrders={[a, b]} readyOrders={[c]} actions={actions} />);
  expect(screen.getByRole('region', { name: 'Ticket 1' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver pedido 2' }));
  rerender(<CashierQueue cashOrders={[{ ...b, total: '90.00' }, a]} readyOrders={[c]} actions={actions} />);
  expect(screen.getByRole('region', { name: 'Ticket 2' })).toHaveTextContent('$90.00');
  expect(screen.getAllByRole('button', { name: /^Cobrar/ })).toHaveLength(1);
  screen.getByRole('button', { name: 'Ver pedido 3' }).focus();
  rerender(<CashierQueue cashOrders={[a]} readyOrders={[c]} actions={actions} />);
  expect(screen.getByRole('region', { name: 'Ticket 1' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver pedido 3' })).toHaveFocus();
});
it('elige el siguiente del mismo grupo y restaura foco solo desde ticket eliminado', async () => {
  const { rerender } = render(<CashierQueue cashOrders={[a]} readyOrders={[b, c]} actions={actions} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver pedido 2' }));
  screen.getByRole('button', { name: 'Cobrar 2' }).focus();
  rerender(<CashierQueue cashOrders={[a]} readyOrders={[c]} actions={actions} />);
  expect(screen.getByRole('region', { name: 'Ticket 3' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Fila de Caja' })).toHaveFocus();
  expect(within(screen.getByRole('region', { name: 'Por cobrar' })).getByLabelText('1 pedidos')).toBeVisible();
});
it('con cero cobros conserva el ticket listo y los dos vacíos son independientes', () => {
  render(<CashierQueue cashOrders={[]} readyOrders={[c]} actions={actions} />);
  expect(screen.getByText('Sin cobros pendientes')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Ticket 3' })).toBeVisible();
  expect(screen.queryByText('Sin entregas pendientes')).not.toBeInTheDocument();
});
