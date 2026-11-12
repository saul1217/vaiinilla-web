import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';

// Con la bandera de saldo en Caja prendida: Caja recarga desde «Saldo», admin solo lo consulta.
vi.mock('../lib/wallet-caja-feature', () => ({ WALLET_CAJA_ENABLED: true }));

const session = vi.hoisted(() => ({ role: 'cajero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { context: { rol: session.role }, access: { establecimiento: { nombre: 'Tienda' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

const renderShell = () => render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);

describe('navegación con saldo en Caja prendido', () => {
  it('Caja ve Caja y Saldo en la barra móvil sin «Más»', () => {
    session.role = 'cajero';
    renderShell();
    const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
    expect(within(mobile).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/app/pos');
    expect(within(mobile).getByRole('link', { name: 'Saldo' })).toHaveAttribute('href', '/app/saldo');
    expect(within(mobile).queryByRole('button', { name: 'Más' })).not.toBeInTheDocument();
  });

  it('admin encuentra «Saldo de clientes» en «Más»', () => {
    session.role = 'admin';
    renderShell();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
    expect(within(screen.getByRole('navigation', { name: 'Más destinos' })).getByRole('link', { name: 'Saldo de clientes' }))
      .toHaveAttribute('href', '/app/saldo');
  });

  it('mesero y cocina no lo ven', () => {
    for (const role of ['mesero', 'cocina']) {
      session.role = role;
      const { unmount } = renderShell();
      expect(screen.queryByRole('link', { name: /Saldo/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('recargas pendientes al salir', () => {
  const PENDING = 'vaiinilla:wallet-recharge:v1:';
  const seed = () => {
    window.localStorage.setItem(`${PENDING}api|store-1|cajero-1|m-1`, '{"version":1}');
    window.localStorage.setItem(`${PENDING}api|store-2|cajero-1|m-2`, '{"version":1}');
    window.localStorage.setItem('otra-clave', 'se queda');
  };
  const pendingKeys = () => Object.keys(window.localStorage).filter((key) => key.startsWith(PENDING));

  afterEach(() => window.localStorage.clear());

  it('cerrar sesión borra todas las recargas pendientes del navegador', async () => {
    session.role = 'cajero';
    seed();
    renderShell();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0]!);
    await waitFor(() => expect(pendingKeys()).toHaveLength(0));
    expect(window.localStorage.getItem('otra-clave')).toBe('se queda');
  });

  it('cambiar de acceso también las borra', async () => {
    session.role = 'cajero';
    seed();
    renderShell();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar acceso' })[0]!);
    await waitFor(() => expect(pendingKeys()).toHaveLength(0));
  });
});
