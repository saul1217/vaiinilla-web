import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { Feedback } from '../components/ui';

type Line = { insumo_id: number; cantidad: number; opcion_id?: number | null };
type Row = Record<string, unknown>;
const label = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';

export function InventarioPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const client = useQueryClient();
  const suppliesQuery = useQuery({ queryKey: ['inventory-supplies'], enabled: !!token, queryFn: () => api.inventorySupplies(token) });
  const productsQuery = useQuery({ queryKey: ['inventory-products'], enabled: !!token, queryFn: () => api.inventoryProducts(token) });
  const supplies = (suppliesQuery.data?.insumos as Row[] | undefined) ?? [];
  const firstSupplyId = supplies[0]?.id;
  const products = (productsQuery.data?.productos as Row[] | undefined) ?? [];
  const [selected, setSelected] = useState('');
  const [editedLines, setEditedLines] = useState<Line[] | null>(null);
  const recipeQuery = useQuery({ queryKey: ['inventory-recipe', selected], enabled: !!token && !!selected, queryFn: () => api.inventoryRecipe(token, selected) });
  const lines = editedLines ?? (Array.isArray(recipeQuery.data?.lineas) ? recipeQuery.data.lineas as Line[] : []);
  const setLines = (update: (previous: Line[]) => Line[]) => setEditedLines(update(lines));
  const save = useMutation({ mutationFn: () => api.saveInventoryRecipe(token, selected, lines), onSuccess: () => client.invalidateQueries({ queryKey: ['inventory-recipe', selected] }) });
  // Unsupported installations hide the route when either required contract is absent.
  if (suppliesQuery.isError || productsQuery.isError || (selected && recipeQuery.isError)) return null;
  return <main className="page-stack admin-screen admin-catalog">
    <AppPageHeader eyebrow="Administración · Operación" title="Inventario y recetas" description="Controla existencias y define qué insumos consume cada producto." />
    <section className="panel-card" aria-busy={suppliesQuery.isLoading || productsQuery.isLoading}>
      <div className="section-heading"><div><p className="eyebrow">Existencias</p><h2>Insumos</h2></div></div>
      {suppliesQuery.isLoading ? <p role="status">Cargando inventario…</p> : supplies.length === 0 ? <p>No hay insumos registrados todavía.</p> : <div className="product-grid">{supplies.map(item => <article className="product-card" key={label(item.id)}><div className="product-card__body"><h3>{label(item.nombre)}</h3><p>{label(item.existencia)} {label(item.unidad)}</p><small>{item.bajo_minimo ? 'Bajo mínimo' : 'Disponible'}</small></div></article>)}</div>}
    </section>
    <section className="panel-card">
      <div className="section-heading"><div><p className="eyebrow">Producción</p><h2>Receta por producto</h2></div></div>
      <label>Producto<select value={selected} onChange={event => { setSelected(event.target.value); setEditedLines(null); }}><option value="">Elige un producto</option>{products.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label>
      {selected && (recipeQuery.isLoading ? <p role="status">Cargando receta…</p> : !recipeQuery.data ? <p>Este producto no tiene receta registrada.</p> : <form onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        {lines.map((line, index) => <div className="flex flex-wrap gap-3" key={`${line.insumo_id}-${index}`}><label>Insumo<select aria-label={`Insumo ${index + 1}`} value={line.insumo_id} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, insumo_id: Number(event.target.value) } : item))}>{supplies.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label><label>Cantidad<input aria-label={`Cantidad ${index + 1}`} type="number" min="0.001" step="0.001" value={line.cantidad} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, cantidad: Number(event.target.value) } : item))} /></label><button className="button button--secondary" type="button" onClick={() => setLines(old => old.filter((_, i) => i !== index))}>Quitar</button></div>)}
        <div className="flex flex-wrap gap-3"><button className="button button--secondary" type="button" onClick={() => firstSupplyId && setLines(old => [...old, { insumo_id: Number(firstSupplyId), cantidad: 1 }])}>Agregar insumo</button><button className="button" type="submit" disabled={save.isPending}>Guardar receta</button></div>
        {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}{save.isSuccess && <Feedback tone="success">Receta guardada.</Feedback>}
      </form>)}
    </section>
  </main>;
}
