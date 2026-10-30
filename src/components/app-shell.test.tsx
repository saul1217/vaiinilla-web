import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminTheme } from '../lib/admin-theme';
import { TenantShell } from './app-shell';

const session = vi.hoisted(() => ({ role: 'mesero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { context: { rol: session.role }, access: { establecimiento: { nombre: 'Tienda' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.adminTheme;
});

describe('tema compartido en la navegación', () => {
  it.each(['mesero', 'cajero', 'cocina', 'admin'])('%s puede cambiar y recordar ambos temas desde el menú móvil', (role) => {
    session.role = role;
    localStorage.setItem('vaiinilla.panel.admin-theme', 'claro');
    const mount = () => render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    expect(screen.getByRole('button', { name: 'Cerrar navegación', expanded: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }));
    expect(document.documentElement).toHaveAttribute('data-admin-theme', 'oscuro');
    expect(localStorage.getItem('vaiinilla.panel.admin-theme')).toBe('oscuro');
    view.unmount();
    mount();
    expect(document.documentElement).toHaveAttribute('data-admin-theme', 'oscuro');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a tema claro' }));
    expect(document.documentElement).toHaveAttribute('data-admin-theme', 'claro');
    expect(localStorage.getItem('vaiinilla.panel.admin-theme')).toBe('claro');
  });
});

function ThemeConsumer() {
  const [theme, setTheme] = useAdminTheme();
  return <button onClick={() => setTheme(theme === 'claro' ? 'oscuro' : 'claro')}>{theme}</button>;
}

it('sincroniza consumidores simultáneos y conserva el cambio al remontar', () => {
  localStorage.setItem('vaiinilla.panel.admin-theme', 'claro');
  const view = render(<><ThemeConsumer /><ThemeConsumer /></>);
  fireEvent.click(screen.getAllByText('claro')[0]!);
  expect(screen.getAllByText('oscuro')).toHaveLength(2);
  view.unmount();
  render(<ThemeConsumer />);
  expect(screen.getByText('oscuro')).toBeInTheDocument();
});
