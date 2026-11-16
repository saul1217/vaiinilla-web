import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';

// El enlace «Pistas» pregunta el tipo de negocio; aquí no es lo que se prueba.
vi.mock('../lib/bowling-admin-feature', () => ({ BOWLING_ADMIN_ENABLED: false }));

// Con la bandera de la agenda prendida: la ven Administración, Caja y Mesero, no Cocina.
vi.mock('../lib/agenda-feature', () => ({ AGENDA_ENABLED: true }));
const session = vi.hoisted(() => ({ role: 'mesero' }));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { context: { rol: session.role }, access: { establecimiento: { nombre: 'Tienda' } } },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

afterEach(() => cleanup());

it('mesero ve su destino y la agenda en la barra móvil', () => {
  session.role = 'mesero';
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(within(mobile).getAllByRole('link')).toHaveLength(3);
  expect(within(mobile).getByRole('link', { name: 'Mesas' })).toBeInTheDocument();
  expect(within(mobile).getByRole('link', { name: 'Agenda de reservas' })).toHaveAttribute('href', '/app/agenda');
  expect(within(mobile).getByRole('link', { name: 'Mi turno' })).toHaveAttribute('href', '/app/mi-turno');
  expect(screen.queryByRole('button', { name: 'Más' })).not.toBeInTheDocument();
});

it('cajero encuentra la agenda en «Más» cuando no cabe en la barra', () => {
  session.role = 'cajero';
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(within(mobile).getByRole('link', { name: 'Caja' })).toBeInTheDocument();
  fireEvent.click(within(mobile).getByRole('button', { name: 'Más' }));
  const more = screen.getByRole('navigation', { name: 'Más destinos' });
  expect(within(more).getByRole('link', { name: 'Agenda de reservas' })).toHaveAttribute('href', '/app/agenda');
});

it('Administración encuentra la agenda en Más', () => {
  session.role = 'admin';
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
  expect(within(mobile).getAllByRole('link')).toHaveLength(4);
  fireEvent.click(within(mobile).getByRole('button', { name: 'Más' }));
  const more = screen.getByRole('navigation', { name: 'Más destinos' });
  expect(within(more).getByRole('link', { name: 'Agenda de reservas' })).toHaveAttribute('href', '/app/agenda');
});

it('Cocina no ve la agenda', () => {
  session.role = 'cocina';
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'Agenda de reservas' })).not.toBeInTheDocument();
});
