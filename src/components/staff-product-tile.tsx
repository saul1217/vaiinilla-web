import type { ReactNode } from 'react';
import type { CatalogProduct } from '../types/api';
import { formatMoney } from '../lib/money';

export function StaffProductTile({ product, selected, children }: { product: CatalogProduct; selected: boolean; children: ReactNode }) {
  return <article className="staff-order__producto" data-agregado={selected}>
    {product.imagen_url
      ? <img className="staff-order__photo" src={product.imagen_url} alt="" width={400} height={300} loading="lazy" />
      : <div className="staff-order__photo staff-order__photo--empty" aria-hidden="true" />}
    <div><strong>{product.nombre}</strong><span>{formatMoney(product.precio_mostrador)}</span></div>
    {children}
  </article>;
}
