import { describe, expect, it } from 'vitest';
import type { InventoryAlerts } from '../types/api';
import {
  PendingReadyQueue,
  UNDO_WINDOW_MS,
  inventoryAlertDetail,
  inventoryAlertHeadline,
  inventoryAlertSupplier,
  inventoryAlertsEmpty,
  namesLabel,
  reservedDayOptions,
} from './kitchen-extras';

const order = (id: string, version = 1) => ({ id, folio: Number(id.replace(/\D/g, '')) || 1, version });
const alerts = (over: Partial<InventoryAlerts> = {}): InventoryAlerts => ({ agotados: [], para_manana: [], bajo_minimo: [], ...over });

describe('deshacer «lista»', () => {
  it('no manda nada antes de 10 s y manda una sola vez al vencer', () => {
    const q = new PendingReadyQueue();
    q.add(order('a1', 3), 1_000);
    expect(q.takeDue(1_000 + UNDO_WINDOW_MS - 1)).toEqual([]);
    expect(q.takeDue(1_000 + UNDO_WINDOW_MS)).toEqual([{ orderId: 'a1', folio: 1, version: 3, deadlineMs: 1_000 + UNDO_WINDOW_MS }]);
    expect(q.takeDue(1_000 + UNDO_WINDOW_MS * 2)).toEqual([]);
  });

  it('deshacer saca la marca una sola vez; volver a marcar reinicia la cuenta', () => {
    const q = new PendingReadyQueue();
    q.add(order('b2'), 0);
    expect(q.undo('b2')).toBe(true);
    expect(q.undo('b2')).toBe(false);
    q.add(order('c3', 1), 0);
    q.add(order('c3', 2), 5_000);
    expect(q.takeDue(UNDO_WINDOW_MS)).toEqual([]);
    expect(q.takeDue(5_000 + UNDO_WINDOW_MS)[0]!.version).toBe(2);
  });

  it('al salir se mandan todas las que esperaban', () => {
    const q = new PendingReadyQueue();
    q.add(order('d4'), 0);
    q.add(order('e5'), 0);
    expect(q.takeAll().map((item) => item.orderId)).toEqual(['d4', 'e5']);
    expect(q.list()).toEqual([]);
  });
});

describe('aviso de insumos', () => {
  it('nombra hasta dos y cuenta el resto', () => {
    expect(namesLabel(['Papa'])).toBe('Papa');
    expect(namesLabel(['Papa', 'Zanahoria'])).toBe('Papa y Zanahoria');
    expect(namesLabel(['Papa', 'Zanahoria', 'Cebolla', 'Chile'])).toBe('Papa, Zanahoria y 2 más');
  });

  it('lo agotado manda sobre lo que no alcanza', () => {
    const a = alerts({
      agotados: [{ id: 1, nombre: 'Albóndigas', faltan: ['Papa', 'Zanahoria'] }, { id: 2, nombre: 'Arroz con pollo', faltan: ['Zanahoria'] }],
      para_manana: [{ id: 9, nombre: 'Tortilla', unidad: 'pza', existencia: 20, consumo_diario: 80 }],
    });
    expect(inventoryAlertHeadline(a)).toBe('Se acabó: Papa y Zanahoria');
    expect(inventoryAlertDetail(a)).toBe('Albóndigas y Arroz con pollo ya salieron del menú. Para mañana falta Tortilla.');
  });

  it('un insumo que no alcanza dice cuánto hay y cuánto se usa, con su proveedor', () => {
    const a = alerts({ para_manana: [{ id: 9, nombre: 'Tortilla', unidad: 'pza', existencia: 20, consumo_diario: 80, proveedor: { nombre: 'Tortillería Lupita', telefono: '614 123 4567' } }] });
    expect(inventoryAlertHeadline(a)).toBe('Tortilla no alcanza para mañana');
    expect(inventoryAlertDetail(a)).toBe('Tienes 20 pza; mañana se usan unos 80 pza.');
    expect(inventoryAlertSupplier(a)).toEqual({ nombre: 'Tortillería Lupita', telefono: '614 123 4567' });
  });

  it('sin nada que avisar queda vacío', () => {
    expect(inventoryAlertsEmpty(alerts())).toBe(true);
    expect(inventoryAlertsEmpty(alerts({ bajo_minimo: [{ id: 1, nombre: 'Aceite', unidad: 'ml', existencia: 100, minimo: 500 }] }))).toBe(false);
  });
});

describe('días de «Para mañana»', () => {
  it('empiezan mañana por la fecha local y cruzan de mes', () => {
    const days = reservedDayOptions(new Date(2026, 10, 29, 23, 30), 3);
    expect(days.map((d) => d.fecha)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
    expect(days[0]!.label).toBe('Mañana · lun 30 nov');
    expect(days[1]!.label).toBe('mar 1 dic');
  });
});
