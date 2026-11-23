import { act, fireEvent, render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TenantShell } from './app-shell';
import { notifySpacesChanged } from '../lib/spaces-changed';

// El enlace «Pistas» pregunta el tipo de negocio; aquí no es lo que se prueba.
vi.mock('../lib/bowling-admin-feature', () => ({ BOWLING_ADMIN_ENABLED: false }));

// Con la bandera de la agenda prendida: la ven Administración, Caja y Mesero, no Cocina.
vi.mock('../lib/agenda-feature', () => ({ AGENDA_ENABLED: true }));
const session = vi.hoisted(() => ({ role: 'mesero', token: '', storeId: '' }));
const courts = vi.hoisted(() => ({ courtAvailability: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: { courtAvailability: courts.courtAvailability },
}));
vi.mock('../context/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: session.token,
      context: { rol: session.role, establecimiento_id: session.storeId },
      access: { establecimiento: { nombre: 'Tienda' } },
    },
    clearAll: vi.fn(), clearTenant: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  session.token = '';
  session.storeId = '';
});

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

const day = (precios: (string | null)[]) => ({
  canchas: precios.map((precio, i) => ({ espacio: { id: i + 1, nombre: `C${i}` }, precio_hora: precio, rentable: precio !== null, ocupado: [] })),
});

it('sin canchas que se renten, la agenda no sale (la escuela)', async () => {
  session.role = 'admin';
  session.token = 't';
  session.storeId = 'escuela-sin-canchas';
  courts.courtAvailability.mockResolvedValue(day([]));
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Agenda de reservas' })).not.toBeInTheDocument());
});

it('una cancha sin precio no cuenta: no se puede rentar', async () => {
  session.role = 'cajero';
  session.token = 't';
  session.storeId = 'cancha-sin-precio';
  courts.courtAvailability.mockResolvedValue(day([null]));
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Agenda de reservas' })).not.toBeInTheDocument());
});

it('con una cancha con precio, la agenda sigue', async () => {
  session.role = 'admin';
  session.token = 't';
  session.storeId = 'club-padel';
  courts.courtAvailability.mockResolvedValue(day(['300.00']));
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getAllByRole('link', { name: 'Agenda de reservas' }).length).toBeGreaterThan(0);
});

it('si la consulta falla, la agenda se muestra como antes', async () => {
  session.role = 'mesero';
  session.token = 't';
  session.storeId = 'falla-red';
  courts.courtAvailability.mockRejectedValue(new Error('sin red'));
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getAllByRole('link', { name: 'Agenda de reservas' }).length).toBeGreaterThan(0);
});

it('al crear la primera cancha con precio, la agenda aparece sin recargar', async () => {
  session.role = 'admin';
  session.token = 't';
  session.storeId = 'escuela-con-cancha-nueva';
  courts.courtAvailability.mockReset().mockResolvedValueOnce(day([]));
  render(<MemoryRouter><TenantShell>Contenido</TenantShell></MemoryRouter>);
  await waitFor(() => expect(courts.courtAvailability).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Agenda de reservas' })).not.toBeInTheDocument());
  courts.courtAvailability.mockResolvedValueOnce(day(['300.00']));
  act(() => notifySpacesChanged());
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación móvil' })).getByRole('button', { name: 'Más' }));
  expect((await screen.findAllByRole('link', { name: 'Agenda de reservas' })).length).toBeGreaterThan(0);
});
