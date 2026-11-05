import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  beforeEach(() => vi.clearAllMocks());

  it('oculta el asistente si su primera solicitud responde 404', async () => {
    apiMock.askStoreAssistant.mockRejectedValue(new Error('404'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Configurar horario');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
