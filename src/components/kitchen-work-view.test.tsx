import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../types/api';
import { KitchenWorkView } from './kitchen-work-view';

const order = (id: string, estado: OrderDetail['estado']): OrderDetail => ({
  id, folio: Number(id), estado, creado_en: '2026-10-30T18:00:00Z', actualizado_en: '2026-10-30T18:00:00Z',
  destino: 'para_llevar', notas_cocina: 'Salsa aparte', usuario: { nombre: 'Ana', matricula: 'A123' }, invitado: true,
  items: [{ id: 1, nombre_producto: 'Tacos', cantidad: 2, opciones: [{ opcion_id: 1, nombre: 'Verde' }] }],
} as OrderDetail);
const pending = order('1', 'por_cobrar');
const preparing = order('2', 'preparando');
const ready = order('3', 'listo');
const props = { pending: [pending], preparing: [preparing], ready: [ready], now: Date.parse('2026-10-30T18:10:00Z'), leavingId: null, actions: () => null, startAll: null };
const featured = (container: HTMLElement) => within(container.querySelector('.kitchen-work__ticket--selected') as HTMLElement);

describe('selección de presentación de Cocina', () => {
  it('prioriza preparando y conserva nota, opciones, matrícula e invitado', () => {
    const { container } = render(<KitchenWorkView {...props} />);
    const ticket = featured(container);
    expect(ticket.getByRole('heading', { name: '#2' })).toBeInTheDocument();
    for (const text of ['Salsa aparte', 'Verde', 'A123', 'Invitado']) expect(ticket.getByText(text)).toBeInTheDocument();
  });
  it('selecciona cualquier fila y mantiene ID tras un refresco sin robar foco', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<KitchenWorkView {...props} />);
    await user.click(screen.getByRole('button', { name: 'Ver comanda 1' }));
    expect(featured(container).getByRole('heading', { name: '#1' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'Ver comanda 3' });
    row.focus();
    rerender(<KitchenWorkView {...props} pending={[{ ...pending, version: 9 }]} />);
    expect(featured(container).getByRole('heading', { name: '#1' })).toBeInTheDocument();
    expect(row).toHaveFocus();
  });
  it('avanza al recibir listo y mantiene el anterior en la cola; no avanza con datos sin cambio', () => {
    const { container, rerender } = render(<KitchenWorkView {...props} />);
    rerender(<KitchenWorkView {...props} preparing={[{ ...preparing }]} />);
    expect(featured(container).getByRole('heading', { name: '#2' })).toBeInTheDocument();
    rerender(<KitchenWorkView {...props} preparing={[]} ready={[{ ...preparing, estado: 'listo' }, ready]} />);
    expect(featured(container).getByRole('heading', { name: '#1' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'En fila' })).getByRole('button', { name: 'Ver comanda 2' })).toBeInTheDocument();
  });
  it('recupera foco solo cuando desaparece el ticket enfocado y ofrece vacío único', () => {
    const { rerender } = render(<KitchenWorkView {...props} actions={() => <button>Acción existente</button>} />);
    screen.getAllByRole('button', { name: 'Acción existente' })[1]!.focus();
    rerender(<KitchenWorkView {...props} pending={[]} preparing={[]} ready={[]} />);
    expect(screen.getByRole('heading', { name: 'Sin comandas activas' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'En fila' })).not.toBeInTheDocument();
  });
});
