import { Eye, EyeOff, Image as ImageIcon, Pencil } from 'lucide-react';
import { Button } from './ui';
import { formatMoney } from '../lib/money';
import type { CatalogProduct } from '../types/api';

export function AdminProductTile({
  product,
  onEdit,
  onAvailability,
}: {
  product: CatalogProduct;
  onEdit: () => void;
  onAvailability: () => void;
}) {
  return (
    <article className="admin-product-tile">
      <div className="admin-product-tile__media">
        <span className="admin-product-tile__placeholder" aria-hidden="true">
          <ImageIcon />
          <span>{product.nombre.trim().charAt(0).toLocaleUpperCase('es-MX')}</span>
        </span>
        {product.imagen_url && (
          <img
            src={product.imagen_url}
            alt={`Imagen de ${product.nombre}`}
            loading="lazy"
            width="400"
            height="300"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        <span
          className={`availability-badge ${product.disponible ? 'availability-badge--on' : 'availability-badge--off'}`}
        >
          {product.disponible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {product.disponible ? 'Disponible' : 'Oculto'}
        </span>
      </div>
      <div className="admin-product-tile__content">
        <h3>{product.nombre}</h3>
        <div className="admin-product-tile__price">
          <strong>{formatMoney(product.precio_mostrador)}</strong>
          {product.precio_digital !== product.precio_mostrador && <span>2 precios</span>}
        </div>
      </div>
      <div className="admin-product-tile__actions">
        <Button variant="ghost" aria-label={`Editar ${product.nombre}`} onClick={onEdit}>
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          aria-label={`${product.disponible ? 'Ocultar' : 'Mostrar'} ${product.nombre}`}
          onClick={onAvailability}
        >
          {product.disponible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </article>
  );
}
