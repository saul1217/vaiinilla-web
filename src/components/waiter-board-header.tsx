import { AppPageHeader } from './app-page-header';
import { SegmentedControl } from './segmented-control';

export function WaiterBoardHeader({ role, businessName, error, loading, loaded, calling, ready, active, onlyPending, onFilter }: {
  role: 'mesero' | 'cajero'; businessName?: string; error: boolean; loading: boolean; loaded: boolean;
  calling: number; ready: number; active: number; onlyPending: boolean; onFilter: (pending: boolean) => void;
}) {
  return (
    <>
      <AppPageHeader id="mesero-board-title" headingLevel={role === 'mesero' ? 1 : 2}
        eyebrow={`${role === 'mesero' ? 'Mesero' : 'Caja'}${businessName ? ` · ${businessName}` : ''}`} title="Mesas"
        action={error ? <span role="status">Sin conexión</span> : undefined} />
      <dl className="staff-stats" aria-busy={loading}>
        <div className={calling ? 'staff-stat staff-stat--call' : 'staff-stat'}>
          <dd>{loaded ? calling : '—'}</dd>
          <dt>llamando</dt>
        </div>
        <div className={ready ? 'staff-stat staff-stat--ready' : 'staff-stat'}>
          <dd>{loaded ? ready : '—'}</dd>
          <dt>{ready === 1 ? 'listo' : 'listos'}</dt>
        </div>
        <div className="staff-stat">
          <dd>{loaded ? active : '—'}</dd>
          <dt>activas</dt>
        </div>
      </dl>
      <SegmentedControl legend="Qué mesas ver" value={onlyPending ? 'pending' : 'all'}
        options={[{ value: 'all', label: 'Todas' }, { value: 'pending', label: 'Por atender' }]}
        onChange={(value) => onFilter(value === 'pending')} />
    </>
  );
}
