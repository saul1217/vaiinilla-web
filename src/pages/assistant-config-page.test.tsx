import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantConfigPage } from './assistant-config-page';
import { VaiinillaApiError } from '../lib/api-error';

const apiMock = vi.hoisted(() => ({ businessSettings: vi.fn(), askStoreAssistant: vi.fn(), saveBusinessSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AssistantConfigPage /></QueryClientProvider>);
}

describe('AssistantConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: 'ambos' });
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: '¿Qué te gustaría configurar?' });
    apiMock.saveBusinessSettings.mockResolvedValue({});
  });

  it('permanece oculto si el recurso de ajustes responde 404', async () => {
    apiMock.businessSettings.mockRejectedValue(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Not found' }));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it.each([new Error('Network error'), new VaiinillaApiError(503, { code: 'UNAVAILABLE', message: 'Unavailable' })])('muestra error recuperable ante fallas transitorias', async error => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockRejectedValueOnce(error).mockResolvedValueOnce({ asistente_modo: 'personal' });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('personal')).toBeChecked();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it.each([405, 501])('mantiene visible la página y permite reintentar si ajustes responde %i', async status => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockRejectedValueOnce(new VaiinillaApiError(status, { code: 'UNAVAILABLE', message: 'Unavailable' }))
      .mockResolvedValueOnce({ asistente_modo: 'personal' });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('personal')).toBeChecked();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('oculta el selector cuando asistente_modo es null', async () => {
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: null });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    expect(screen.queryByText('Modo del asistente')).not.toBeInTheDocument();
  });

  it.each(['ambos', 'personal', 'ninguno'] as const)('guarda el modo %s sin invocar al modelo', async mode => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: mode === 'ambos' ? 'personal' : 'ambos' });
    renderPage();
    const personal = await screen.findByLabelText(mode);
    await user.click(personal);
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', { asistente_modo: mode }));
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('comprueba disponibilidad sin invocar al modelo al cargar', async () => {
    renderPage();
    expect(await screen.findByText('¿Qué te gustaría configurar en tu tienda?')).toBeVisible();
    expect(apiMock.businessSettings).toHaveBeenCalledWith('tenant-token');
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('mantiene el asistente y permite reintentar un envío fallido', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce({ mensaje: 'Listo' });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Configura mi tienda');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('button', { name: 'Reintentar envío' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    expect(await screen.findByText('Listo')).toBeVisible();
    expect(apiMock.askStoreAssistant).toHaveBeenCalledTimes(2);
  });

  it('mantiene la propuesta y permite reintentar una aplicación fallida', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: 'Propuesta lista', propuesta: { cambios: { tipo: 'cafeteria' } } });
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce({});
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Configura mi tienda');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await user.click(await screen.findByRole('button', { name: 'Aceptar y aplicar cambios' }));
    expect(await screen.findByRole('button', { name: 'Reintentar aplicación' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar aplicación' }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledTimes(2));
  });
});
