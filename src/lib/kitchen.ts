import type { OrderDetail } from '../types/api';

export type KitchenStage = 'pending' | 'preparing' | 'ready';

export function kitchenOrderUnits(order: OrderDetail): number {
  return order.items.reduce((total, item) => total + item.cantidad, 0);
}

export function minutesSince(value: string, now: number): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now - timestamp) / 60_000));
}
