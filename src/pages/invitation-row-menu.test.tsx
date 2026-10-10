import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffInvitation, StaffMembership } from '../types/api';
import { InvitationRow } from './invitations-page';

vi.mock('../lib/api', () => ({ api: {} }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: null }) }));

const invitation = { id: 1, email: 'ana@example.com', rol: 'cajero', estado: 'aceptada', creado_en: '2026-01-01T00:00:00Z', expira_en: '2026-01-08T00:00:00Z' } as unknown as StaffInvitation;
const membership = { id: 1, email: 'ana@example.com', rol: 'cajero' } as unknown as StaffMembership;

function setup() {
  const onEdit = vi.fn();
  const onDeactivate = vi.fn();
  render(<table><tbody><InvitationRow invitation={invitation} membership={membership} onAction={vi.fn()} onEdit={onEdit} onDeactivate={onDeactivate} /></tbody></table>);
  return { onEdit, onDeactivate, trigger: screen.getByRole('button', { name: /Opciones de ana@example.com/ }) };
}

describe('menú de acciones por fila en Personal', () => {
  it('se cierra con Escape y devuelve el foco al botón', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('se cierra con un clic fuera del menú', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('no se cierra al hacer clic dentro del menú', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('abrir el menú de otra fila cierra el anterior', async () => {
    const user = userEvent.setup();
    const other = { ...invitation, id: 2, email: 'beto@example.com' } as StaffInvitation;
    const otherMembership = { ...membership, id: 2, email: 'beto@example.com' } as StaffMembership;
    render(<table><tbody>
      <InvitationRow invitation={invitation} membership={membership} onAction={vi.fn()} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      <InvitationRow invitation={other} membership={otherMembership} onAction={vi.fn()} onEdit={vi.fn()} onDeactivate={vi.fn()} />
    </tbody></table>);
    await user.click(screen.getByRole('button', { name: /Opciones de ana@example.com/ }));
    await user.click(screen.getByRole('button', { name: /Opciones de beto@example.com/ }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Opciones de ana@example.com/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Opciones de beto@example.com/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('mantiene funcionando las acciones', async () => {
    const user = userEvent.setup();
    const { trigger, onEdit, onDeactivate } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /Editar rol/ }));
    expect(onEdit).toHaveBeenCalledWith(membership);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /Desactivar acceso/ }));
    expect(onDeactivate).toHaveBeenCalledWith(membership);
  });
});
