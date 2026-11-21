import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { SettingsSearch } from './settings-search';

const apiMock = vi.hoisted(() => ({ businessSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

it('pide los ajustes al entrar al campo y lleva a la pantalla del ajuste', async () => {
  apiMock.businessSettings.mockResolvedValue({ tipo_bloqueado: true, cobro_requiere_codigo: false });
  render(<MemoryRouter><SettingsSearch token="t" /></MemoryRouter>);
  expect(apiMock.businessSettings).not.toHaveBeenCalled();
  const input = screen.getByLabelText('Buscar ajuste');
  fireEvent.focus(input);
  await waitFor(() => expect(apiMock.businessSettings).toHaveBeenCalledWith('t'));
  fireEvent.change(input, { target: { value: 'codigo cobrar' } });
  const list = await screen.findByRole('list', { name: 'Ajustes encontrados' });
  expect(within(list).getByRole('link', { name: /Pedir el código del cliente al cobrar/ })).toHaveAttribute('href', '/app/flujo?ajuste=operacion');
  fireEvent.change(input, { target: { value: 'tipo de negocio' } });
  expect(screen.getByRole('status')).toHaveTextContent('No hay un ajuste con «tipo de negocio».');
});
