import { splitSpaceName } from '../lib/staff-ui';

export function SpaceTile({ name, state, caption, index, onClick }: {
  name: string; state: 'call' | 'ready' | 'active' | 'free'; caption: string; index: number; onClick: () => void;
}) {
  const { number, kind } = splitSpaceName(name);
  const label = { call: 'Llamando', ready: 'Pedido listo', active: 'Con pedidos', free: 'Libre' }[state];
  return <button type="button" className={`staff-tile staff-tile--${state}`} style={{ ['--i' as string]: index }}
    onClick={onClick} aria-label={`${name}. ${label}`}>
    <span className="staff-tile__name">{number && <strong>{number}</strong>}<span>{kind || name}</span></span>
    <small>{caption}</small>
  </button>;
}
