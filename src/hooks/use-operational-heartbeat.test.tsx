import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { isHeartbeatRole, useOperationalHeartbeat } from './use-operational-heartbeat';

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { heartbeat: mocks.heartbeat },
}));

describe('useOperationalHeartbeat', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('reporta Cocina usando un dispositivo estable de esta ventana', async () => {
    mocks.heartbeat.mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { unmount } = renderHook(
      () => useOperationalHeartbeat({
        token: 'tenant-token',
        scopeId: 'establecimiento-1',
        role: 'cocina',
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(mocks.heartbeat).toHaveBeenCalledTimes(1));
    expect(mocks.heartbeat).toHaveBeenCalledWith(
      'tenant-token',
      expect.stringMatching(/^web-cocina-/),
      'cocina',
    );

    unmount();
    queryClient.clear();
  });

  it('no atribuye latidos operativos a Administración', () => {
    expect(isHeartbeatRole('admin')).toBe(false);
    expect(isHeartbeatRole('cajero')).toBe(true);
    expect(isHeartbeatRole('cocina')).toBe(true);
    expect(isHeartbeatRole('mesero')).toBe(true);
  });
});
