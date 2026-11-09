import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, ReceiptText, ServerOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { useCortesScope, useCortesSessionIsolation } from '../hooks/use-cortes-session-isolation';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import {
  classifyCortesError,
  cortesKeys,
  parseAccountingReport,
  parseDayCut,
  parseShiftCut,
  paymentMethodLabel,
  spaceTypeLabel,
  staffRoleLabel,
  type CortesScope,
  type CutCash,
  type SalesBreakdown,
} from '../lib/cortes-reporte';

const today = () => new Date().toLocaleDateString('en-CA');
const money = (value: string | null | undefined) => Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const isNotZero = (value: string) => Number(value) !== 0;
const ordersText = (n: number) => (n === 1 ? '1 pedido' : `${n} pedidos`);
const timeText = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');

export function CortesReportePage() {
  const { tenant } = useSessions();
  const scope = useCortesScope();
  useCortesSessionIsolation(scope);
  if (!tenant || !scope) return null;
  // La llave remonta la pantalla al cambiar de sesión: fecha, turno y pestaña vuelven a empezar.
  return <CortesReporteContent key={`${scope.establecimientoId}|${scope.membresiaId}|${scope.usuarioId}`} scope={scope} token={tenant.token} />;
}

function CortesReporteContent({ scope, token }: { scope: CortesScope; token: string }) {
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<'caja' | 'contador'>('caja');
  const [selectedShift, setSelectedShift] = useState('');
  const validPeriod = !!from && !!to && from <= to;

  const cut = useQuery({
    queryKey: cortesKeys.dayCut(scope, date),
    enabled: tab === 'caja' && !!date,
    queryFn: async ({ signal }) => parseDayCut(await api.cashDayCut(token, date, signal)),
  });
  // Solo se pide un turno que pertenece al corte del día mostrado.
  const shiftId = selectedShift && cut.data?.turnos.some((turno) => turno.id === selectedShift) ? selectedShift : '';
  const shift = useQuery({
    queryKey: cortesKeys.shiftCut(scope, shiftId),
    enabled: tab === 'caja' && !!shiftId,
    queryFn: async ({ signal }) => parseShiftCut(await api.cashSessionCut(token, shiftId, signal)),
  });
  const report = useQuery({
    queryKey: cortesKeys.accounting(scope, from, to),
    enabled: tab === 'contador' && validPeriod,
    queryFn: async ({ signal }) => parseAccountingReport(await api.accountingReport(token, from, to, signal)),
  });

  const changeDate = (value: string) => {
    setDate(value);
    setSelectedShift('');
  };

  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow="Administración · Caja" title="Cortes y reporte" description="Consulta el cierre del día o prepara la información para contabilidad." />
    <ChipRow label="Tipo de reporte">
      <Chip selected={tab === 'caja'} onClick={() => { setTab('caja'); setSelectedShift(''); }}>Corte del día</Chip>
      <Chip selected={tab === 'contador'} onClick={() => setTab('contador')}>Contabilidad</Chip>
    </ChipRow>
    {tab === 'caja' ? <Card aria-busy={cut.isLoading || shift.isLoading}>
      <div className="flex flex-wrap items-end gap-3">
        <label>Fecha operativa<input aria-label="Fecha operativa" type="date" value={date} onChange={(e) => changeDate(e.target.value)} /></label>
        {shiftId && <VaiButton variant="quiet" onClick={() => setSelectedShift('')}>Volver al día</VaiButton>}
      </div>
      <QueryView query={cut}>{(day) => shiftId
        ? <QueryView query={shift}>{(turno) => <>
          <h2 className="vai-card__title">Corte del turno {timeText(turno.turno.abiertaEn)}{turno.turno.cerradaEn ? ` a ${timeText(turno.turno.cerradaEn)}` : ''} · {turno.final ? 'final' : 'parcial'}</h2>
          <CashTable cash={turno.turno.efectivo} />
          <Breakdown data={turno.desglose} />
        </>}</QueryView>
        : <>
          <h2 className="vai-card__title">Resumen del día {day.fecha} · {day.final ? 'final' : 'parcial'}</h2>
          {day.turnos.length > 0 && <section aria-label="Turnos"><h3 className="vai-card__title">Turnos</h3><ul className="grid gap-2">{day.turnos.map((turno) => <li key={turno.id}>
            <VaiButton variant="secondary" onClick={() => setSelectedShift(turno.id)}>{turno.fecha} {timeText(turno.abiertaEn)}{turno.cerradaEn ? ` a ${timeText(turno.cerradaEn)}` : ' (abierto)'} · {money(turno.efectivo.esperado)}</VaiButton>
          </li>)}</ul></section>}
          <CashTable cash={day.efectivo} />
          {day.sinTurno.pedidos > 0 && <p className="vai-card__description">Cobrado sin caja abierta: {ordersText(day.sinTurno.pedidos)} · {money(day.sinTurno.ventas)} (ya incluido en las ventas).</p>}
          <Breakdown data={day.desglose} />
        </>}</QueryView>
    </Card> : <Card aria-busy={report.isLoading}>
      <div className="flex flex-wrap items-end gap-3">
        <label>Desde<input aria-label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta<input aria-label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!validPeriod ? <p className="vai-card__description" role="alert">La fecha «Desde» debe ser igual o anterior a «Hasta».</p> : <QueryView query={report}>{(data) => <>
        <h2 className="vai-card__title">Ventas del periodo{data.negocio ? ` · ${data.negocio}` : ''}</h2>
        <Breakdown data={data.desglose} withDays />
      </>}</QueryView>}
    </Card>}
  </main>;
}

const ERROR_COPY = {
  unauthenticated: { title: 'Tu sesión terminó', message: 'Vuelve a entrar o reintenta en un momento.' },
  forbidden: { title: 'Sin permiso', message: 'Esta cuenta no tiene permiso para ver cortes y reportes de este negocio.' },
  'not-found': { title: 'Turno no encontrado', message: 'Ese turno no existe en este negocio.' },
  server: { title: 'El servidor tuvo un problema', message: 'No pudimos calcular la información. Reintenta en un momento.' },
  network: { title: 'Sin conexión', message: 'No pudimos conectar con el servidor. Revisa tu conexión a internet.' },
} as const;

/** Carga, error con reintento, 404 de endpoint no soportado o el contenido. Nunca una pantalla vacía. */
function QueryView<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isError) {
    const kind = classifyCortesError(query.error);
    if (kind === 'unsupported') {
      return <div role="alert"><VaiEmptyState icon={<ServerOff />} title="Cortes no disponibles en este servidor" message="El servidor todavía no tiene cortes y reporte contable. Pide que lo actualicen; tus ventas no se ven afectadas." /></div>;
    }
    const copy = kind === 'unknown' ? { title: 'No se pudo cargar la información', message: errorMessage(query.error) } : ERROR_COPY[kind];
    return <div role="alert"><VaiEmptyState icon={<AlertTriangle />} title={copy.title} message={copy.message} action={<VaiButton variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Reintentar</VaiButton>} /></div>;
  }
  if (query.isLoading) return <LoadingState label="Cargando información…" cards={2} />;
  if (query.data === undefined) return <VaiEmptyState icon={<ReceiptText />} title="Sin información" message="No hay información para este periodo." />;
  return <>{children(query.data)}</>;
}

function CashTable({ cash }: { cash: CutCash }) {
  const rows: [string, string | null][] = [
    ['Fondo', cash.fondo],
    ['Cobros en efectivo', cash.cobrosEfectivo],
    ['Propinas en efectivo', cash.propinas],
    ['Recargas', cash.recargas],
    ['Entradas', cash.entradas],
    ['Salidas', cash.salidas],
    ['Devoluciones en efectivo', cash.devoluciones],
    ['Efectivo esperado', cash.esperado],
  ];
  if (cash.contado !== null) rows.push(['Contado', cash.contado], ['Diferencia', cash.diferencia]);
  const arqueo = cash.arqueo ? { cuadra: 'Cuadra', sobra: 'Sobra', falta: 'Falta' }[cash.arqueo] : null;
  return <section aria-label="Efectivo"><h3 className="vai-card__title">Efectivo{arqueo ? ` · ${arqueo}` : ''}</h3>
    <dl className="stats-grid">{rows.map(([label, value]) => <div className="stat-card" key={label}><dt>{label}</dt><dd><strong>{money(value)}</strong></dd></div>)}</dl>
  </section>;
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  return <section aria-label={title}>
    <h3 className="vai-card__title">{title}</h3>
    {rows.length === 0 ? <p className="vai-card__description">{empty}</p> : <div className="responsive-table"><table>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
    </table></div>}
  </section>;
}

/** Los desgloses que comparten el corte y el reporte, como AdminCashCutSection.kt de Android. */
function Breakdown({ data, withDays = false }: { data: SalesBreakdown; withDays?: boolean }) {
  const r = data.resumen;
  const extras: [string, string][] = [
    ['Propinas con terminal', data.propinas.terminal],
    ['Propinas en efectivo', data.propinas.efectivo],
  ];
  if (isNotZero(r.rentas)) extras.push(['Rentas de pista o cancha', r.rentas]);
  if (isNotZero(r.descuentos)) extras.push(['Descuentos', r.descuentos]);
  if (isNotZero(r.envios)) extras.push(['Envíos', r.envios]);
  if (isNotZero(data.devoluciones.articulosRechazados)) extras.push(['Devuelto por artículos rechazados', data.devoluciones.articulosRechazados]);
  if (isNotZero(data.devoluciones.reembolsosReserva)) extras.push(['Reembolsos de reservas', data.devoluciones.reembolsosReserva]);
  if (isNotZero(data.devoluciones.devolucionesEntregadas)) extras.push(['Devoluciones entregadas', data.devoluciones.devolucionesEntregadas]);
  return <>
    <dl className="stats-grid" aria-label="Resumen de ventas">
      <div className="stat-card"><dt>Ventas</dt><dd><strong>{money(r.ventas)}</strong></dd></div>
      <div className="stat-card"><dt>Pedidos</dt><dd><strong>{r.pedidos}</strong></dd></div>
      <div className="stat-card"><dt>Ticket promedio</dt><dd><strong>{money(r.ticketPromedio)}</strong></dd></div>
      <div className="stat-card"><dt>Propinas</dt><dd><strong>{money(data.propinas.total)}</strong></dd></div>
      <div className="stat-card"><dt>Cancelados</dt><dd><strong>{data.cancelados.pedidos} · {money(data.cancelados.monto)}</strong></dd></div>
    </dl>
    <Table title="Por forma de pago" head={['Forma de pago', 'Pedidos', 'Monto']} empty="Sin ventas todavía."
      rows={data.formasPago.map((p) => [paymentMethodLabel(p.metodo), p.pedidos, money(p.monto)])} />
    <Table title="Otros conceptos" head={['Concepto', 'Monto']} empty=""
      rows={extras.map(([label, value]) => [label, money(value)])} />
    <Table title="Por categoría" head={['Categoría', 'Cantidad', 'Importe']} empty="Sin artículos vendidos."
      rows={data.porCategoria.map((c) => [c.categoria, c.cantidad, money(c.importe)])} />
    <Table title="Por producto" head={['Producto', 'Categoría', 'Cantidad', 'Importe']} empty="Sin artículos vendidos."
      rows={data.porProducto.map((p) => [p.producto, p.categoria, p.cantidad, money(p.importe)])} />
    <Table title="Por personal" head={['Nombre', 'Rol', 'Pedidos', 'Ventas', 'Ticket promedio']} empty="Sin pedidos."
      rows={data.porPersonal.map((s) => [
        s.usuarioId ? s.nombre ?? 'Sin nombre' : 'Clientes (app o QR)',
        s.usuarioId ? staffRoleLabel(s.rol) : '',
        s.pedidos,
        money(s.ventas),
        s.ticketPromedio === null ? '' : money(s.ticketPromedio),
      ])} />
    <Table title="Por mesa o pista" head={['Lugar', 'Tipo', 'Pedidos', 'Ventas', 'Rentas', 'Consumo']} empty="Sin pedidos."
      rows={data.porEspacio.map((e) => [
        e.espacioId ? e.nombre ?? 'Sin nombre' : 'Para llevar o mostrador',
        e.espacioId ? spaceTypeLabel(e.tipo) : '',
        e.pedidos,
        money(e.ventas),
        money(e.rentas),
        money(e.consumo),
      ])} />
    {withDays && data.porDia.length > 1 && <Table title="Por día" head={['Fecha', 'Pedidos', 'Ventas']} empty=""
      rows={data.porDia.map((d) => [d.fecha, d.pedidos, money(d.ventas)])} />}
  </>;
}
