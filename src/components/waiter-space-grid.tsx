import type { ComponentProps } from 'react';
import { SpaceTile } from './space-tile';

type Tile = Pick<ComponentProps<typeof SpaceTile>, 'name' | 'state' | 'caption'> & { id: number };
export function WaiterSpaceGrid({ tiles, onSelect }: { tiles: Tile[]; onSelect: (id: number) => void }) {
  return <div className="staff-tiles">{tiles.map((tile, index) =>
    <SpaceTile key={tile.id} {...tile} index={index} onClick={() => onSelect(tile.id)} />)}</div>;
}
