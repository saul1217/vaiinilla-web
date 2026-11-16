import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';

// El enlace «Pistas» pregunta el tipo de negocio; aquí no es lo que se prueba.
vi.mock('../lib/bowling-admin-feature', () => ({ BOWLING_ADMIN_ENABLED: false }));

// Con la bandera de reparto prendida: admin y Caja lo ven; mesero y Cocina no.
vi.mock('../lib/reparto-feature', () => ({ REPARTO_ENABLED: true }));

const session = vi.hoisted(() => ({ role: 'cajero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { context: { rol: session.role }, access: { establecimiento: { nombre: 'Tienda' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

const renderShell = () => render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);

describe('navegación con reparto prendido', () => {
  it('Caja ve «Reparto» en la barra móvil', () => {
    session.role = 'cajero';
    renderShell();
    const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
    expect(within(mobile).getByRole('link', { name: 'Reparto' })).toHaveAttribute('href', '/app/reparto');
  });

  it('con más de cuatro destinos, Caja deja sus tres primeros en la barra y el resto en «Más»', () => {
    session.role = 'cajero';
    renderShell();
    const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
    expect(within(mobile).getAllByRole('link').map((link) => link.textContent)).toEqual(['Caja', 'Saldo', 'Reparto']);
    fireEvent.click(within(mobile).getByRole('button', { name: 'Más' }));
    const more = screen.getByRole('navigation', { name: 'Más destinos' });
    expect(within(more).getAllByRole('link').map((link) => link.textContent)).toEqual(['Agenda de reservas', 'Mi turno']);
  });

  it('admin encuentra «Reparto y encargos» en «Más»', () => {
    session.role = 'admin';
    renderShell();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
    expect(within(screen.getByRole('navigation', { name: 'Más destinos' })).getByRole('link', { name: 'Reparto y encargos' }))
      .toHaveAttribute('href', '/app/reparto');
  });

  it('mesero y cocina no lo ven', () => {
    for (const role of ['mesero', 'cocina']) {
      session.role = role;
      const { unmount } = renderShell();
      expect(screen.queryByRole('link', { name: /Reparto/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});
