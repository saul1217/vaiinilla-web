import type { AnalyticsPeriod } from '../types/api';

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

export function localAnalyticsDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function analyticsPeriodForDays(days: number): AnalyticsPeriod {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - days + 1);
  return { desde: localAnalyticsDate(desde), hasta: localAnalyticsDate(hasta) };
}

export function defaultAnalyticsPeriod(): AnalyticsPeriod {
  return analyticsPeriodForDays(30);
}

export function formatAnalyticsMoney(value: string | number): string {
  const numeric = Number(value);
  return currency.format(Number.isFinite(numeric) ? numeric : 0);
}
