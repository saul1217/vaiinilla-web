import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OfflineStaffOrdersApi } from '../hooks/use-offline-staff-orders';
import type { OfflineStaffOrder } from '../lib/offline-staff-orders';
import { OfflineStaffOrdersPanel } from './offline-staff-orders-panel';

const order = (over: Partial<OfflineStaffOrder>): OfflineStaffOrder => ({
  id: 'o1', idempotencyKey: 'k', localFolio: 'C1-001', placeLabel: 'Para llevar', summary: '1× Taco',
  capturedAt: '2026-11-09T18:00:00.000Z', problem: null, collectedCash: false, registeredFolio: null,
  body: { metodo_pago: 'efectivo', destino: 'para_llevar', espacio_id: null, items: [] }, ...over,
});

function api(over: Partial<OfflineStaffOrdersApi>): OfflineStaffOrdersApi {
  return {
    enabled: true, scope: null, store: { read: () => null, write: () => undefined, remove: () => undefined },
    pending: [], problems: [], sending: false, storageError: null,
    enqueue: vi.fn(), retry: vi.fn(), resolve: vi.fn(), flushNow: vi.fn(), ...over,
  };
}

describe('OfflineStaffOrdersPanel', () => {
  it('sin pedidos ni fallas no ocupa lugar', () => {
    const { container } = render(<OfflineStaffOrdersPanel offline={api({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa si el almacenamiento falla aunque no haya pedidos', () => {
    render(<OfflineStaffOrdersPanel offline={api({ storageError: 'Este navegador no deja guardar pedidos sin conexión.' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('no deja guardar');
  });

  it('muestra pendientes, efectivo sin corte y problemas con Reintentar y Ya lo registré', async () => {
    const user = userEvent.setup();
    const offline = api({
      pending: [order({ id: 'p1', localFolio: 'C1-002', collectedCash: true })],
      problems: [
        order({ id: 'x1', localFolio: 'C1-001', problem: 'El producto ya no existe.' }),
        order({ id: 'x2', localFolio: 'C1-003', problem: 'Cobrado sin registrar', registeredFolio: 55 }),
      ],
    });
    render(<OfflineStaffOrdersPanel offline={offline} />);
    expect(screen.getByText(/Hay 1 cobro en efectivo/)).toBeVisible();
    expect(screen.getByText('El producto ya no existe.')).toBeVisible();
    // El ya registrado sin cobro no se reenvía: solo «Ya lo registré».
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(offline.retry).toHaveBeenCalledWith('x1');
    await user.click(screen.getAllByRole('button', { name: 'Ya lo registré' })[1]!);
    expect(offline.resolve).toHaveBeenCalledWith('x2');
    await user.click(screen.getByRole('button', { name: 'Mandar ahora' }));
    expect(offline.flushNow).toHaveBeenCalled();
  });
});
