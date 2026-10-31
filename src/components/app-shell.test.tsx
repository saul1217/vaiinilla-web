import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminTheme } from '../lib/admin-theme';
import { CASHBACK_ENABLED } from '../lib/features';
import { PlatformShell, TenantShell } from './app-shell';

const session = vi.hoisted(() => ({ role: 'mesero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { context: { rol: session.role }, access: { establecimiento: { nombre: 'Tienda' } } },
    platform: { token: 'platform' },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.adminTheme;
});

describe('tema compartido en la navegación', () => {
  it('admin no muestra cashback cuando el feature flag está apagado', () => {
    session.role = 'admin';
    render(
      <MemoryRouter>
        <TenantShell>Contenido</TenantShell>
      </MemoryRouter>,
    );
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
    expect(screen.queryByRole('link', { name: 'Cashback y wallet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cashback/i })).not.toBeInTheDocument();
    expect(CASHBACK_ENABLED).toBe(false);
  });

  it.each(['mesero', 'cajero', 'cocina', 'admin'])('%s puede cambiar y recordar ambos temas desde el menú móvil', (role) => {
    session.role = role;
    localStorage.setItem('vaiinilla.panel.admin-theme', 'claro');
    const mount = () => render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir opciones de cuenta' }));
    expect(screen.getByRole('dialog', { name: 'Opciones de cuenta' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar a tema oscuro' }));
    expect(document.documentElement).toHaveAttribute('data-admin-theme', 'oscuro');
    expect(localStorage.getItem('vaiinilla.panel.admin-theme')).toBe('oscuro');
    view.unmount();
    mount();
    expect(document.documentElement).toHaveAttribute('data-admin-theme', 'oscuro');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir opciones de cuenta' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar a tema claro' }));
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

it('Admin alcanza sus destinos (cashback oculto por flag) sin asignar aria-current al botón Más', () => {
  session.role = 'admin';
  render(<MemoryRouter initialEntries={['/app/espacios']}><TenantShell><h1>Espacios</h1></TenantShell></MemoryRouter>);
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(within(mobile).getAllByRole('link')).toHaveLength(4);
  const more = within(mobile).getByRole('button', { name: 'Más' });
  expect(more).not.toHaveAttribute('aria-current');
  fireEvent.click(more);
  const links = within(screen.getByRole('navigation', { name: 'Más destinos' })).getAllByRole('link');
  expect(links).toHaveLength(CASHBACK_ENABLED ? 4 : 3);
  expect(links.find((link) => link.getAttribute('href') === '/app/espacios')).toHaveAttribute('aria-current', 'page');
});

it.each([['mesero', 'Mesas'], ['cajero', 'Caja'], ['cocina', 'Cocina']])('%s solo expone su destino', (role, label) => {
  session.role = role;
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(within(mobile).getAllByRole('link')).toHaveLength(1);
  expect(within(mobile).getByRole('link', { name: label })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Más' })).not.toBeInTheDocument();
});

it('mueve foco a main al navegar y no lo roba por un refresco de contenido', () => {
  session.role = 'admin';
  const mount = (content: string) => <MemoryRouter><TenantShell><h1>{content}</h1><button>Actualizar</button></TenantShell></MemoryRouter>;
  const view = render(mount('Inicio'));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('link', { name: 'Menú' }));
  expect(screen.getByRole('main')).toHaveFocus();
  screen.getByRole('button', { name: 'Actualizar' }).focus();
  view.rerender(mount('Datos nuevos'));
  expect(screen.getByRole('button', { name: 'Actualizar' })).toHaveFocus();
});

it('Plataforma conserva su navegación sin heredar tab bar ni cuenta de tenant', () => {
  render(<MemoryRouter><PlatformShell><h1>Resumen global</h1></PlatformShell></MemoryRouter>);
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Navegación móvil' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir opciones de cuenta' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
  expect(screen.getByRole('button', { name: 'Cerrar navegación', expanded: true })).toBeInTheDocument();
});
