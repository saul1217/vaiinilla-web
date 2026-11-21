// «Caja» del dueño (Doop 39 a 41; `admin-cash.tsx` de Expo): con la caja cerrada, cómo quedó el
// último cierre; abierta, el efectivo que debe haber, fondo, efectivo y tarjeta del turno, y los
// cobros en efectivo. Aquí no se cobra: eso es de Caja.
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';
import type { CashLastClose, CashSession } from '../types/api';
import { Feedback } from './ui';

const time = (iso: string) => new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' }).format(new Date(iso));
const when = (iso: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export function AdminCashSummary({
  token,
  active,
  lastClose,
}: {
  token: string;
  active: CashSession | null;
  lastClose: CashLastClose | null | undefined;
}) {
  const report = useQuery({
    queryKey: ['cash-drawer', active?.id],
    enabled: Boolean(token) && Boolean(active?.id),
    queryFn: () => api.cashDrawer(token, active!.id),
    refetchInterval: 30_000,
  });

  if (!active) {
    const rows: [string, string][] = lastClose
      ? ([
          lastClose.monto_inicial ? ['Fondo inicial', formatMoney(lastClose.monto_inicial)] : null,
          lastClose.ventas_efectivo ? ['Ventas en efectivo', formatMoney(lastClose.ventas_efectivo)] : null,
          lastClose.efectivo_esperado ? ['Efectivo esperado', formatMoney(lastClose.efectivo_esperado)] : null,
          lastClose.monto_final ? ['Efectivo contado', formatMoney(lastClose.monto_final)] : null,
        ].filter(Boolean) as [string, string][])
      : [];
    return (
      <section className="admin-cash" aria-label="Último cierre">
        <h2 className="eyebrow">{lastClose?.cerrada_en ? `Último cierre · ${when(lastClose.cerrada_en)}` : 'Último cierre'}</h2>
        {rows.length === 0 ? (
          <p className="admin-cash__hint">Cuando cierres la caja, aquí ves cómo quedó.</p>
        ) : (
          <dl className="admin-cash__rows">
            {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        )}
      </section>
    );
  }

  const summary = report.data?.resumen;
  const charges = (report.data?.movimientos ?? [])
    .filter((movement) => movement.tipo === 'cobro' && !movement.sale)
    .sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en))
    .slice(0, 30);
  return (
    <section className="admin-cash" aria-label="Sesión de caja">
      <h2 className="eyebrow">{active.abierta_en ? `Sesión de caja · desde ${time(active.abierta_en)}` : 'Sesión de caja'}</h2>
      {report.isError && <Feedback tone="error">{errorMessage(report.error)}</Feedback>}
      <div className="admin-cash__hero">
        <span>Efectivo esperado en caja</span>
        <strong>{summary ? formatMoney(summary.efectivo_esperado) : '—'}</strong>
      </div>
      <dl className="admin-cash__tiles">
        <div><dt>Fondo</dt><dd>{formatMoney(summary?.fondo ?? active.monto_inicial)}</dd></div>
        <div><dt>Efectivo</dt><dd>{summary ? `+${formatMoney(summary.cobros_efectivo)}` : '—'}</dd></div>
        <div><dt>Tarjeta</dt><dd>{summary?.cobros_tarjeta ? formatMoney(summary.cobros_tarjeta) : '—'}</dd></div>
      </dl>
      <h3 className="admin-cash__subtitle">Cobros en efectivo</h3>
      {report.isPending ? (
        <p className="admin-cash__hint">Consultando…</p>
      ) : charges.length === 0 ? (
        <p className="admin-cash__hint">Aún no hay cobros en efectivo en esta sesión.</p>
      ) : (
        <ul className="admin-cash__charges">
          {charges.map((movement) => (
            <li key={movement.id}>
              <span>
                <strong>{movement.pedido?.folio != null ? `#${movement.pedido.folio}` : 'Cobro en efectivo'}</strong>
                <small>{[movement.registrado_por?.nombre, time(movement.creado_en)].filter(Boolean).join(' · ')}</small>
              </span>
              <strong>+{formatMoney(movement.monto)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="admin-cash__hint">Los pagos con tarjeta no entran al efectivo de la caja.</p>
    </section>
  );
}
