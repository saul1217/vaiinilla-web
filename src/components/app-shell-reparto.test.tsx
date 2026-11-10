import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';

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
