import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { Card, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { canEditInventory, inventoryKeys } from '../lib/inventory-access';
import type { RecipeLineInput } from '../types/api';

type Scope = { token: string; storeId: string; membershipId: string; userId: string; role: string };

const label = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
const isForbidden = (error: unknown) => error instanceof VaiinillaApiError && error.status === 403;

export function InventarioPage() {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const scope: Scope = {
    token: tenant.token,
    storeId: tenant.context.establecimiento_id,
    membershipId: tenant.context.membresia_id,
    userId: tenant.context.usuario_id,
    role: tenant.context.rol,
  };
  // Remontar al cambiar de negocio, membresía, identidad o rol descarta el borrador y la
  // selección de la sesión anterior: no deben pasar de una tienda o rol a otro.
  return <InventoryScreen key={`${scope.storeId}:${scope.membershipId}:${scope.userId}:${scope.role}`} scope={scope} />;
}

function InventoryScreen({ scope }: { scope: Scope }) {
  const { token, role } = scope;
  const keys = inventoryKeys(scope);
  const client = useQueryClient();
  const overviewQuery = useQuery({ queryKey: keys.overview, enabled: !!token, queryFn: () => api.inventoryOverview(token) });
  const productsQuery = useQuery({ queryKey: keys.products, enabled: !!token, queryFn: () => api.inventoryProducts(token) });
  const supplies = overviewQuery.data?.insumos ?? [];
  const products = productsQuery.data ?? [];
  const permissions = overviewQuery.data?.permisos;
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecipeLineInput[] | null>(null);
  // Tras un fallo al guardar, la edición queda bloqueada hasta que vuelva el permiso consultado
  // después de ese fallo.
  const [refreshingPermission, setRefreshingPermission] = useState(false);
  const recipeQuery = useQuery({ queryKey: keys.recipe(selected ?? 0), enabled: !!token && selected !== null, queryFn: () => api.productRecipe(token, selected ?? 0) });
  const lines: RecipeLineInput[] = draft ?? (recipeQuery.data ?? []).map(line => ({ insumo_id: line.insumo_id, cantidad: line.cantidad, opcion_id: line.opcion_id ?? null }));
  const setLines = (update: (previous: RecipeLineInput[]) => RecipeLineInput[]) => setDraft(update(lines));

  const permissionFresh = !refreshingPermission;
  const permissionKnown = overviewQuery.isSuccess;
  const canEdit = permissionKnown && permissionFresh && canEditInventory(role, permissions);
  const revokedWithDraft = draft !== null && permissionKnown && permissionFresh && !canEditInventory(role, permissions);

  const save = useMutation({
    mutationFn: (payload: { productId: number; lines: RecipeLineInput[] }) => api.saveProductRecipe(token, payload.productId, payload.lines),
    onSuccess: async (_data, payload) => {
      setDraft(null);
      await client.invalidateQueries({ queryKey: keys.recipe(payload.productId) });
    },
    onError: async () => {
      // El borrador se queda en `draft`. Se bloquea la edición y se vuelve a pedir el permiso.
      setRefreshingPermission(true);
      try {
        await client.refetchQueries({ queryKey: keys.overview });
      } finally {
        setRefreshingPermission(false);
      }
    },
  });
  const kitchenPermission = useMutation({
    mutationFn: (allow: boolean) => api.setInventoryKitchenPermission(token, allow),
    onSettled: () => client.invalidateQueries({ queryKey: keys.overview }),
  });

  const supplyName = (id: number) => label(supplies.find(item => Number(item.id) === id)?.nombre);
  const loadError = overviewQuery.error ?? productsQuery.error ?? (selected !== null ? recipeQuery.error : null);
  const retryLoad = () => {
    if (overviewQuery.isError) void overviewQuery.refetch();
    if (productsQuery.isError) void productsQuery.refetch();
    if (selected !== null && recipeQuery.isError) void recipeQuery.refetch();
  };
  const readOnlyLines = (items: RecipeLineInput[]) => items.length === 0
    ? <p>Este producto no tiene insumos en su receta.</p>
    : <ul className="grid gap-2">{items.map((line, index) => <li key={`${line.insumo_id}-${index}`}>{supplyName(line.insumo_id)} · {label(line.cantidad)}</li>)}</ul>;

  return <main className="page-stack admin-screen admin-catalog">
    <AppPageHeader eyebrow={role === 'cocina' ? 'Cocina · Operación' : 'Administración · Operación'} title="Inventario y recetas" description="Controla existencias y define qué insumos consume cada producto." />
    {loadError && <Feedback tone="error">
      {isForbidden(loadError) ? 'No tienes permiso para ver esta parte del inventario.' : `No se pudo cargar el inventario: ${errorMessage(loadError)}`}
      {' '}<VaiButton variant="secondary" onClick={retryLoad}>Reintentar</VaiButton>
    </Feedback>}
    {role === 'admin' && permissions && typeof permissions.cocina_edita === 'boolean' && <Card title="Permiso de Cocina" description="Cocina siempre ve el inventario. Si lo permites, también da de alta insumos y edita recetas, entradas y ajustes.">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={permissions.cocina_edita} disabled={kitchenPermission.isPending || overviewQuery.isFetching} onChange={event => kitchenPermission.mutate(event.target.checked)} />
        <span>Cocina puede editar el inventario</span>
      </label>
      {kitchenPermission.isError && <Feedback tone="error">{errorMessage(kitchenPermission.error)}</Feedback>}
    </Card>}
    <Card title="Insumos" description="Existencias" aria-busy={overviewQuery.isLoading || productsQuery.isLoading}>
      {overviewQuery.isLoading ? <LoadingState label="Cargando inventario…" cards={2} /> : supplies.length === 0 ? <VaiEmptyState icon={<PackageOpen />} title="Sin insumos" message={overviewQuery.isError ? 'No se pudieron cargar los insumos.' : 'No hay insumos registrados todavía.'} /> : <div className="product-grid">{supplies.map(item => <article className="product-card" key={label(item.id)}><div className="product-card__body"><h3>{label(item.nombre)}</h3><p>{label(item.existencia)} {label(item.unidad)}</p><small>{item.bajo_minimo ? 'Bajo mínimo' : 'Disponible'}</small></div></article>)}</div>}
    </Card>
    <Card title="Receta por producto" description="Producción">
      <label>Producto<select value={selected ?? ''} onChange={event => { setSelected(event.target.value ? Number(event.target.value) : null); setDraft(null); save.reset(); }}><option value="">Elige un producto</option>{products.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label>
      {save.isError && <Feedback tone="error">
        {isForbidden(save.error) ? 'Ya no tienes permiso para editar el inventario. Tu borrador sigue aquí; pídele al administrador que te dé permiso y vuelve a intentarlo.' : `No se guardó la receta: ${errorMessage(save.error)}. Tu borrador sigue aquí.`}
        {!permissionFresh && ' Revisando tu permiso…'}
      </Feedback>}
      {revokedWithDraft && !save.isError && <Feedback tone="error">Tu permiso para editar el inventario cambió. Tu borrador sigue aquí, pero no se puede guardar hasta que el administrador te dé permiso.</Feedback>}
      {selected !== null && permissionKnown && !canEdit && !revokedWithDraft && !save.isError && <Feedback tone="info">{role === 'cocina' ? 'Puedes consultar las recetas. Para editarlas, el administrador tiene que darle permiso a Cocina.' : 'Puedes consultar las recetas, pero no editarlas.'}</Feedback>}
      {selected !== null && (recipeQuery.isLoading ? <LoadingState label="Cargando receta…" cards={1} /> : recipeQuery.isError && draft === null ? null : !canEdit ? readOnlyLines(lines) : <form onSubmit={event => { event.preventDefault(); save.mutate({ productId: selected, lines }); }}>
        {lines.map((line, index) => <div className="flex flex-wrap gap-3" key={`${line.insumo_id}-${index}`}><label>Insumo<select aria-label={`Insumo ${index + 1}`} value={line.insumo_id} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, insumo_id: Number(event.target.value) } : item))}>{supplies.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.nombre)}</option>)}</select></label><label>Cantidad<input aria-label={`Cantidad ${index + 1}`} type="number" min="0.001" step="0.001" value={line.cantidad} onChange={event => setLines(old => old.map((item, i) => i === index ? { ...item, cantidad: Number(event.target.value) } : item))} /></label><VaiButton variant="secondary" onClick={() => setLines(old => old.filter((_, i) => i !== index))}>Quitar</VaiButton></div>)}
        <div className="flex flex-wrap gap-3"><VaiButton variant="secondary" onClick={() => { const first = supplies[0]; if (first) setLines(old => [...old, { insumo_id: Number(first.id), cantidad: 1, opcion_id: null }]); }}>Agregar insumo</VaiButton><VaiButton variant="accent" type="submit" loading={save.isPending}>Guardar receta</VaiButton></div>
        {save.isSuccess && <Feedback tone="success">Receta guardada.</Feedback>}
      </form>)}
    </Card>
  </main>;
}
