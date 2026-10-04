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

/** Minutos ya calculados, en una frase corta: "3 min", "2 h 5 min" o "3 d 17 h". */
export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}
