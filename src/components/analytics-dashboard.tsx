import { CalendarDays, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { useId, useState } from 'react';
import { analyticsPeriodForDays, formatAnalyticsMoney, localAnalyticsDate } from '../lib/analytics';
import type { AnalyticsPeriod, DailySalesMetric } from '../types/api';

type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

const compactCurrency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const shortDate = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
});

interface PeriodSelectorProps {
  value: AnalyticsPeriod;
  onChange: (value: AnalyticsPeriod) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [preset, setPreset] = useState<PeriodPreset>('30d');

  function choosePreset(next: PeriodPreset) {
    setPreset(next);
    if (next === 'today') onChange(analyticsPeriodForDays(1));
    if (next === '7d') onChange(analyticsPeriodForDays(7));
    if (next === '30d') onChange(analyticsPeriodForDays(30));
  }

  return (
    <section className="analytics-toolbar" aria-label="Periodo del reporte">
      <div className="analytics-toolbar__lead">
        <span className="analytics-toolbar__icon">
          <CalendarDays aria-hidden="true" />
        </span>
        <div>
          <strong>Periodo del reporte</strong>
          <p>Las fechas incluyen el día inicial y el final.</p>
        </div>
      </div>
      <div className="period-selector">
        <div className="period-presets" aria-label="Periodos rápidos">
          {(
            [
              ['today', 'Hoy'],
              ['7d', '7 días'],
              ['30d', '30 días'],
              ['custom', 'Personalizado'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`period-chip${preset === key ? ' period-chip--active' : ''}`}
              aria-pressed={preset === key}
              onClick={() => choosePreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="period-custom">
            <label>
              Desde
              <input
                type="date"
                value={value.desde}
                max={value.hasta}
                onChange={(event) => onChange({ ...value, desde: event.target.value })}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={value.hasta}
                min={value.desde}
                max={localAnalyticsDate(new Date())}
                onChange={(event) => onChange({ ...value, hasta: event.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

interface SalesTrendChartProps {
  data: DailySalesMetric[];
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const width = 720;
  const height = 250;
  const padding = { top: 22, right: 18, bottom: 42, left: 58 };
  const values = data.map((item) => Number(item.ventas) || 0);
  const maxValue = Math.max(...values, 0);
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;
  const points = values.map((value, index) => {
    const x = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (value / Math.max(maxValue, 1)) * chartHeight;
    return { x, y, value, item: data[index] };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length
    ? `${padding.left},${padding.top + chartHeight} ${line} ${points.at(-1)?.x},${padding.top + chartHeight}`
    : '';
  const labelIndexes = Array.from(
    new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]),
  ).filter((index) => index >= 0);

  return (
    <article className="analytics-card analytics-card--wide">
      <header className="analytics-card__header">
        <div>
          <p className="eyebrow">Tendencia</p>
          <h2>Ventas por día</h2>
        </div>
        <span>{data.reduce((sum, item) => sum + item.pedidos, 0)} pedidos</span>
      </header>
      {data.length === 0 ? (
        <AnalyticsEmptyState message="No hay ventas registradas en este periodo." />
      ) : (
        <>
          <div className="sales-chart">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              <title id={titleId}>Gráfica de ventas diarias</title>
              <desc id={descriptionId}>
                Ventas confirmadas en pesos mexicanos para cada día del periodo.
              </desc>
              {[0, 0.5, 1].map((ratio) => {
                const y = padding.top + chartHeight * ratio;
                const amount = maxValue * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line
                      className="sales-chart__grid"
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      className="sales-chart__axis"
                      x={padding.left - 9}
                      y={y + 4}
                      textAnchor="end"
                    >
                      {compactCurrency.format(amount)}
                    </text>
                  </g>
                );
              })}
              {area && <polygon className="sales-chart__area" points={area} />}
              {line && <polyline className="sales-chart__line" points={line} />}
              {points.map((point) => (
                <circle
                  key={point.item?.fecha}
                  className="sales-chart__point"
                  cx={point.x}
                  cy={point.y}
                  r="4"
                >
                  <title>{`${point.item?.fecha}: ${formatAnalyticsMoney(point.value)}, ${point.item?.pedidos} pedidos`}</title>
                </circle>
              ))}
              {labelIndexes.map((dataIndex) => {
                const item = data[dataIndex];
                const x = padding.left + (dataIndex / Math.max(data.length - 1, 1)) * chartWidth;
                return (
                  <text
                    key={`${item?.fecha}-${dataIndex}`}
                    className="sales-chart__date"
                    x={x}
                    y={height - 10}
                    textAnchor={
                      dataIndex === 0 ? 'start' : dataIndex === data.length - 1 ? 'end' : 'middle'
                    }
                  >
                    {item ? shortDate.format(new Date(`${item.fecha}T12:00:00`)) : ''}
                  </text>
                );
              })}
            </svg>
          </div>
          <details className="analytics-data-table">
            <summary>Ver datos de la gráfica</summary>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ventas</th>
                    <th>Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.fecha}>
                      <td>{item.fecha}</td>
                      <td>{formatAnalyticsMoney(item.ventas)}</td>
                      <td>{item.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </article>
  );
}

export interface RankedMetric {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  meta?: string;
  state?: 'positive' | 'warning' | 'neutral';
}

interface RankedBarChartProps {
  title: string;
  eyebrow: string;
  items: RankedMetric[];
  emptyMessage: string;
}

export function RankedBarChart({ title, eyebrow, items, emptyMessage }: RankedBarChartProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  return (
    <article className="analytics-card">
      <header className="analytics-card__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </header>
      {items.length === 0 ? (
        <AnalyticsEmptyState message={emptyMessage} />
      ) : (
        <ol className="ranked-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <div className="ranked-list__line">
                <span>
                  <b>{index + 1}</b>
                  {item.label}
                </span>
                <strong>{item.valueLabel}</strong>
              </div>
              <div className="bar-track" aria-hidden="true">
                <span
                  className={`bar-fill bar-fill--${item.state ?? 'neutral'}`}
                  style={{
                    width: `${Math.max((item.value / Math.max(maxValue, 1)) * 100, item.value ? 4 : 0)}%`,
                  }}
                />
              </div>
              {item.meta && <small>{item.meta}</small>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

export function AnalyticsEmptyState({ message }: { message: string }) {
  return (
    <div className="analytics-empty">
      <ChartNoAxesColumnIncreasing aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
