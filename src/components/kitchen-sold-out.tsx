// «¿Qué se acabó?» (Doop N03): Cocina apaga un producto y deja de ofrecerse en el menú y en Caja;
// lo prende igual cuando vuelve a haber. POST /catalogo/productos/:id/disponibilidad (admin, cajero y cocina).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppSheet } from './app-sheet';
import { Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { searchKey } from '../lib/cashier-search';
import type { CatalogProduct } from '../types/api';

export function KitchenSoldOut({ token, scopeId, open, onOpenChange }: { token: string; scopeId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const catalog = useQuery({
    queryKey: ['catalog', scopeId, 'cocina'],
    enabled: open && Boolean(token),
    queryFn: () => api.catalog(token),
  });
  const toggle = useMutation({
    mutationFn: (product: CatalogProduct) => api.changeProductAvailability(token, product.id, !product.disponible),
    onSuccess: async (saved) => {
      setNotice({ tone: 'success', text: saved.disponible ? `${saved.nombre} vuelve a ofrecerse.` : `${saved.nombre} ya no se ofrece en el menú ni en Caja.` });
      await queryClient.invalidateQueries({ queryKey: ['catalog', scopeId] });
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error) }),
  });

  const needle = searchKey(query.trim());
  const products = (catalog.data?.productos ?? [])
    .filter((product) => !needle || searchKey(product.nombre).includes(needle))
    // Lo apagado arriba, para volver a prenderlo rápido.
    .sort((a, b) => Number(a.disponible) - Number(b.disponible) || a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) { setQuery(''); setNotice(null); } }}
      title="¿Qué se acabó?"
      description="Apaga lo que ya no hay: deja de ofrecerse en el menú y en Caja hasta que lo vuelvas a prender."
    >
      <div className="kitchen-sold-out">
        <label className="cashier-search__field">
          <span className="sr-only">Buscar producto</span>
          <input type="search" value={query} autoComplete="off" placeholder="Buscar producto" onChange={(event) => setQuery(event.target.value)} />
        </label>
        {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
        {catalog.isPending ? <p role="status">Cargando el menú…</p> : catalog.isError ? (
          <Feedback tone="error">{errorMessage(catalog.error)}</Feedback>
        ) : products.length === 0 ? <p className="cashier-search__empty">Ningún producto coincide.</p> : (
          <ul className="kitchen-sold-out__list" aria-label="Productos del menú">
            {products.map((product) => {
              const busy = toggle.isPending && toggle.variables?.id === product.id;
              return (
                <li key={product.id} className={product.disponible ? '' : 'kitchen-sold-out__item--off'}>
                  <span>{product.nombre}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={product.disponible}
                    aria-label={`${product.nombre}: ${product.disponible ? 'se ofrece' : 'se acabó'}`}
                    className="kitchen-sold-out__switch"
                    disabled={toggle.isPending}
                    aria-busy={busy || undefined}
                    onClick={() => toggle.mutate(product)}
                  >
                    {product.disponible ? 'Hay' : 'Se acabó'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppSheet>
  );
}
