import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CortesReportePage } from './cortes-reporte-page';

const apiMock = vi.hoisted(() => ({ cashDayCut: vi.fn(), accountingReport: vi.fn(), cashSessionCut: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CortesReportePage /></QueryClientProvider>);
}

describe('CortesReportePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.cashDayCut.mockResolvedValue({ resumen: {}, turnos: [{ id: 'caja-1', fecha_operativa: '2026-11-04', efectivo: '125.50' }] });
  });

  it('presenta los campos del contrato de cortes del backend', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /2026-11-04.*\$125\.50/ })).toBeInTheDocument();
  });
});
