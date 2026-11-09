import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
    apiMock.cashDayCut.mockResolvedValue({ resumen: {}, turnos: [{ id: 'caja-1', fecha_operativa: '2026-11-04', efectivo: { fondo: '50.00', cobros_efectivo: '100.00', efectivo_esperado: '150.00' } }] });
  });

  it('presenta los campos del contrato de cortes del backend', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /2026-11-04.*\$150\.00/ })).toBeInTheDocument();
  });

  it('cambia a contabilidad con los chips de la base de diseño', async () => {
    apiMock.accountingReport.mockResolvedValue({ resumen: { ventas: 100 } });
    renderPage();
    const contable = screen.getByRole('button', { name: 'Contabilidad' });
    expect(screen.getByRole('button', { name: 'Corte del día' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(contable);
    expect(contable).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Ventas del periodo')).toBeInTheDocument();
    expect(apiMock.accountingReport).toHaveBeenCalledWith('tenant-token', expect.any(String), expect.any(String));
  });

  it('oculta la pantalla si el backend no tiene el endpoint', async () => {
    apiMock.cashDayCut.mockRejectedValue(new Error('404'));
    const { container } = renderPage();
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
