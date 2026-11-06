import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';

const today = () => new Date().toLocaleDateString('en-CA');
const money = (value: unknown) => Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const textValue = (value: unknown, fallback = '—') => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;

export function CortesReportePage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<'caja' | 'contador'>('caja');
  const [selectedShift, setSelectedShift] = useState('');
  const cut = useQuery({ queryKey: ['cash-day-cut', date], enabled: !!token && tab === 'caja', queryFn: () => api.cashDayCut(token, date) });
  const report = useQuery({ queryKey: ['accounting-report', from, to], enabled: !!token && tab === 'contador', queryFn: () => api.accountingReport(token, from, to) });
  const shift = useQuery({ queryKey: ['cash-session-cut', selectedShift], enabled: !!token && !!selectedShift && tab === 'caja', queryFn: () => api.cashSessionCut(token, selectedShift) });
  const current = tab === 'caja' ? (selectedShift ? shift : cut) : report;
  // Legacy backends may not have migration 170 yet; hide the whole feature on any endpoint failure.
  if (current.isError) return null;
  const data = current.data;
  const summary = data?.resumen as Record<string, unknown> | undefined;
  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow="Administración · Caja" title="Cortes y reporte" description="Consulta el cierre del día o prepara la información para contabilidad." />
    <div className="filter-bar" role="tablist" aria-label="Tipo de reporte">
      <button className={`filter-chip ${tab === 'caja' ? 'filter-chip--active' : ''}`} role="tab" aria-selected={tab === 'caja'} onClick={() => { setTab('caja'); setSelectedShift(''); }}>Corte del día</button>
      <button className={`filter-chip ${tab === 'contador' ? 'filter-chip--active' : ''}`} role="tab" aria-selected={tab === 'contador'} onClick={() => setTab('contador')}>Contabilidad</button>
    </div>
    <section className="panel-card" aria-busy={current.isLoading}>
      <div className="flex flex-wrap items-end gap-3">
        {tab === 'caja' ? <label>Fecha operativa<input aria-label="Fecha operativa" type="date" value={date} onChange={e => setDate(e.target.value)} /></label> : <><label>Desde<input aria-label="Desde" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input aria-label="Hasta" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}
      </div>
      {current.isLoading ? <p role="status">Cargando información…</p> : !data ? <p>No hay información para este periodo.</p> : <>
        <h2>{tab === 'caja' ? 'Resumen del día' : 'Ventas del periodo'}</h2>
        <dl className="stats-grid">{Object.entries(summary ?? {}).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div className="stat-card" key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><strong>{typeof value === 'number' && /venta|monto|efectivo|propina|diferencia/i.test(key) ? money(value) : textValue(value)}</strong></dd></div>)}</dl>
        {Array.isArray(data.turnos) && <section><h2>Turnos</h2><ul>{data.turnos.map((item, index) => { const turn = item as Record<string, unknown>; const efectivo = turn.efectivo as Record<string, unknown> | null; const id = textValue(turn.id, ''); return <li key={id || String(index)}><button className="button button--secondary" type="button" onClick={() => setSelectedShift(id)}>{textValue(turn.fecha_operativa, 'Fecha sin especificar')} · {money(efectivo?.efectivo_esperado)}</button></li>; })}</ul></section>}
        {tab === 'contador' && <p>Desglose por forma de pago, categoría, producto, personal y espacio.</p>}
      </>}
    </section>
  </main>;
}
