import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantConfigPage } from './assistant-config-page';

const apiMock = vi.hoisted(() => ({ askStoreAssistant: vi.fn(), saveBusinessSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AssistantConfigPage /></QueryClientProvider>);
}

describe('AssistantConfigPage', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.askStoreAssistant.mockResolvedValue({ mensaje: '¿Qué te gustaría configurar?' }); });

  it('oculta el asistente si la consulta inicial responde 404', async () => {
    apiMock.askStoreAssistant.mockRejectedValue(new Error('404'));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('oculta el asistente si su primera solicitud responde 404', async () => {
    apiMock.askStoreAssistant.mockRejectedValue(new Error('404'));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
