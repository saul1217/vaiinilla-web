import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantConfigPage } from './assistant-config-page';

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
    apiMock.businessSettings.mockResolvedValue({});
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: '¿Qué te gustaría configurar?' });
    apiMock.saveBusinessSettings.mockResolvedValue({});
  });

  it.each(['404', '503'])('permanece oculto si el recurso de ajustes inicial responde %s', async (status) => {
    apiMock.businessSettings.mockRejectedValue(new Error(status));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
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
