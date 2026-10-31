import type { RefObject } from 'react';
import { Button } from './ui';
import type { ManagedSpace, SpaceType } from '../types/api';

const labels: Record<SpaceType, string> = {
  mesa: 'Mesa',
  barra: 'Barra',
  cancha: 'Cancha',
  drive_thru: 'Drive-thru',
  asiento: 'Asiento',
};

export function SpaceListItem({
  space,
  onQr,
  onEdit,
  qrRef,
  editRef,
}: {
  space: ManagedSpace;
  onQr: () => void;
  onEdit: () => void;
  qrRef?: RefObject<HTMLButtonElement | null>;
  editRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <article className="space-list-item panel-card" aria-label={space.nombre}>
      <div className="space-list-item__summary">
        <h2>{space.nombre}</h2>
        <p>
          {labels[space.tipo]}
          {space.codigo ? ` · Código ${space.codigo}` : ''}
          {space.tipo === 'cancha' && space.precio_hora ? ` · $${space.precio_hora}/hora` : ''}
        </p>
        <span className={`status-badge ${space.activo ? 'status-badge--success' : 'status-badge--muted'}`}>
          {space.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div className="space-list-item__actions">
        <Button ref={qrRef} type="button" variant="ghost" aria-label={`QR y código de ${space.nombre}`} onClick={onQr}>
          QR y código
        </Button>
        <Button ref={editRef} type="button" variant="ghost" aria-label={`Editar ${space.nombre}`} onClick={onEdit}>
          Editar
        </Button>
      </div>
    </article>
  );
}
