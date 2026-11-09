import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { Card, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';

type Line = { insumo_id: number; cantidad: number; opcion_id?: number | null };
type Row = Record<string, unknown>;
type Permissions = { puede_editar?: boolean; cocina_edita?: boolean };
const label = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';

export function InventarioPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const role = tenant?.context.rol;
  const client = useQueryClient();
  const suppliesQuery = useQuery({ queryKey: ['inventory-supplies'], enabled: !!token, queryFn: () => api.inventorySupplies(token) });
  const productsQuery = useQuery({ queryKey: ['inventory-products'], enabled: !!token, queryFn: () => api.inventoryProducts(token) });
  const supplies = (suppliesQuery.data?.insumos as Row[] | undefined) ?? [];
  const firstSupplyId = supplies[0]?.id;
  const products = (productsQuery.data?.productos as Row[] | undefined) ?? [];
  // Desde la migración 205, GET /inventario/insumos dice si esta sesión puede editar y si el
  // admin dejó a Cocina editar (`cocina_edita_inventario`). Sin ese dato (backend anterior),
  // solo el admin edita: Cocina queda en lectura para no chocar con un 403 del PUT.
  const permissions = suppliesQuery.data?.permisos as Permissions | undefined;
  const canEdit = typeof permissions?.puede_editar === 'boolean' ? permissions.puede_editar : role === 'admin';
  const kitchenEdits = permissions?.cocina_edita === true;
  const [selected, setSelected] = useState('');
  const [editedLines, setEditedLines] = useState<Line[] | null>(null);
  const recipeQuery = useQuery({ queryKey: ['inventory-recipe', selected], enabled: !!token && !!selected, queryFn: () => api.inventoryRecipe(token, selected) });
  const lines = editedLines ?? (Array.isArray(recipeQuery.data?.lineas) ? recipeQuery.data.lineas as Line[] : []);
  const setLines = (update: (previous: Line[]) => Line[]) => setEditedLines(update(lines));
  const save = useMutation({ mutationFn: () => api.saveInventoryRecipe(token, selected, lines), onSuccess: () => client.invalidateQueries({ queryKey: ['inventory-recipe', selected] }) });
  const kitchenPermission = useMutation({
    mutationFn: (allow: boolean) => api.setInventoryKitchenPermission(token, allow),
    onSuccess: () => client.invalidateQueries({ queryKey: ['inventory-supplies'] }),
  });
  // Unsupported installations hide the route when either required contract is absent.
  if (suppliesQuery.isError || productsQuery.isError || (selected && recipeQuery.isError) || save.isError) return null;
  const supplyName = (id: number) => label(supplies.find(item => Number(item.id) === id)?.nombre);
  return <main className="page-stack admin-screen admin-catalog">
    <AppPageHeader eyebrow={role === 'cocina' ? 'Cocina · Operación' : 'Administración · Operación'} title="Inventario y recetas" description="Controla existencias y define qué insumos consume cada producto." />
    {role === 'admin' && permissions && typeof permissions.cocina_edita === 'boolean' && <Card title="Permiso de Cocina" description="Cocina siempre ve el inventario. Si lo permites, también da de alta insumos y edita recetas, entradas y ajustes.">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={kitchenEdits} disabled={kitchenPermission.isPending || suppliesQuery.isFetching} onChange={event => kitchenPermission.mutate(event.target.checked)} />
        <span>Cocina puede editar el inventario</span>
      </label>
      {kitchenPermission.isError && <Feedback tone="error">{errorMessage(kitchenPermission.error)}</Feedback>}
    </Card>}
    <Card title="Insumos" description="Existencias" aria-busy={suppliesQuery.isLoading || productsQuery.isLoading}>
      {suppliesQuery.isLoading ? <LoadingState label="Cargando inventario…" cards={2} /> : supplies.length === 0 ? <VaiEmptyState icon={<PackageOpen />} title="Sin insumos" message="No hay insumos registrados todavía." /> : <div className="product-grid">{supplies.map(item => <article className="product-card" key={label(item.id)}><div className="product-card__body"><h3>{label(item.nombre)}</h3><p>{label(item.existencia)} {label(item.unidad)}</p><small>{item.bajo_minimo ? 'Bajo mínimo' : 'Disponible'}</small></div></article>)}</div>}
    </Card>
    <Card title="Receta por producto" description="Producción">
      <label>Producto<select value={selected} onChange={event => { setSelected(event.target.value); setEditedLines(null); }}><option value="">Elige un producto</option>{products.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label>
      {selected && !suppliesQuery.isLoading && !canEdit && <Feedback tone="info">{role === 'cocina' ? 'Puedes consultar las recetas. Para editarlas, el administrador tiene que darle permiso a Cocina.' : 'Puedes consultar las recetas, pero no editarlas.'}</Feedback>}
      {selected && (recipeQuery.isLoading ? <LoadingState label="Cargando receta…" cards={1} /> : !recipeQuery.data ? <VaiEmptyState icon={<PackageOpen />} title="Sin receta" message="Este producto no tiene receta registrada." /> : !canEdit ? (lines.length === 0 ? <p>Este producto no tiene insumos en su receta.</p> : <ul className="grid gap-2">{lines.map((line, index) => <li key={`${line.insumo_id}-${index}`}>{supplyName(line.insumo_id)} · {label(line.cantidad)}</li>)}</ul>) : <form onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        {lines.map((line, index) => <div className="flex flex-wrap gap-3" key={`${line.insumo_id}-${index}`}><label>Insumo<select aria-label={`Insumo ${index + 1}`} value={line.insumo_id} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, insumo_id: Number(event.target.value) } : item))}>{supplies.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label><label>Cantidad<input aria-label={`Cantidad ${index + 1}`} type="number" min="0.001" step="0.001" value={line.cantidad} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, cantidad: Number(event.target.value) } : item))} /></label><VaiButton variant="secondary" onClick={() => setLines(old => old.filter((_, i) => i !== index))}>Quitar</VaiButton></div>)}
        <div className="flex flex-wrap gap-3"><VaiButton variant="secondary" onClick={() => firstSupplyId && setLines(old => [...old, { insumo_id: Number(firstSupplyId), cantidad: 1 }])}>Agregar insumo</VaiButton><VaiButton variant="accent" type="submit" loading={save.isPending}>Guardar receta</VaiButton></div>
        {save.isSuccess && <Feedback tone="success">Receta guardada.</Feedback>}
      </form>)}
    </Card>
  </main>;
}
