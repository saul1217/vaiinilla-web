// Insumos del inventario (Expo `admin-inventory.tsx`): existencias con su mínimo, alta y edición,
// entradas, mermas y ajustes, el conteo de fin de turno y «Lo usan» (qué productos lo gastan).
// Los movimientos llevan su propio UUID: un reintento no los cuenta dos veces.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { INVENTORY_UNITS, MOVEMENT_COPY, parseQty, qtyLabel, unitShort, validMovement, type MovementKind } from '../lib/inventory';
import { formatMoney } from '../lib/money';
import type { InventoryOverview, InventoryProduct, InventoryStock, InventoryUnit } from '../types/api';
import { AppSheet } from './app-sheet';
import { Button, Feedback, Field, SelectField } from './ui';
import { Card, LoadingState, VaiEmptyState } from './vai';

const money = (value: number | null | undefined) => formatMoney((value ?? 0).toFixed(2));

export function InventorySupplies({
  token,
  overviewKey,
  overview: base,
  canEdit,
  showCosts,
  products,
}: {
  token: string;
  /** Prefijo de caché del inventario de esta sesión: se refresca completo tras cada cambio. */
  overviewKey: readonly unknown[];
  /** Los insumos activos que ya consultó la página. */
  overview: { data: InventoryOverview | undefined; isLoading: boolean };
  canEdit: boolean;
  /** Costos y valor solo para quien administra. */
  showCosts: boolean;
  products: InventoryProduct[];
}) {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  // Los dados de baja solo se piden al querer verlos.
  const withInactive = useQuery({ queryKey: [...overviewKey, 'con-bajas'], enabled: Boolean(token) && showInactive, queryFn: () => api.inventoryOverview(token, true) });
  const overview = showInactive ? { data: withInactive.data ?? base.data, isLoading: withInactive.isLoading, isError: withInactive.isError, error: withInactive.error } : { ...base, isError: false, error: null };
  const [moving, setMoving] = useState<{ supply: InventoryStock; kind: MovementKind } | null>(null);
  const [editing, setEditing] = useState<InventoryStock | 'nuevo' | null>(null);
  const [uses, setUses] = useState<InventoryStock | null>(null);
  const [counting, setCounting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: overviewKey });
    await queryClient.invalidateQueries({ queryKey: ['inventario-avisos'] });
  };
  const supplies = overview.data?.insumos ?? [];
  const active = supplies.filter((supply) => supply.activo !== false);
  const low = active.filter((supply) => supply.bajo_minimo).length;
  const value = active.reduce((sum, supply) => sum + (supply.valor ?? 0), 0);

  return (
    <Card title="Insumos" description="Existencias" aria-busy={overview.isLoading}>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {overview.isError && <Feedback tone="error">{errorMessage(overview.error)}</Feedback>}
      <dl className="inventory-figures">
        <div><dt>Insumos</dt><dd>{active.length}</dd></div>
        <div data-alert={low > 0}><dt>Bajo mínimo</dt><dd>{low}</dd></div>
        {showCosts && <div><dt>Valor</dt><dd>{money(value)}</dd></div>}
      </dl>
      <div className="form-actions">
        {canEdit && <Button onClick={() => setEditing('nuevo')}><Plus aria-hidden="true" className="size-4" /> Agregar insumo</Button>}
        {active.length > 0 && <Button variant="secondary" onClick={() => setCounting(true)}>Contar (fin de turno)</Button>}
        <Button variant="ghost" aria-pressed={showInactive} onClick={() => setShowInactive((on) => !on)}>
          {showInactive ? 'Ocultar dados de baja' : 'Ver dados de baja'}
        </Button>
      </div>
      {overview.isLoading ? (
        <LoadingState label="Cargando inventario…" cards={2} />
      ) : supplies.length === 0 ? (
        <VaiEmptyState icon={<PackageOpen />} title="Sin insumos" message="No hay insumos registrados todavía." />
      ) : (
        <ul className="inventory-supplies">
          {supplies.map((supply) => (
            <li key={supply.id} data-low={Boolean(supply.bajo_minimo)} data-inactive={supply.activo === false}>
              <div className="inventory-supplies__main">
                <h3>{supply.nombre}</h3>
                <small>
                  {[supply.categoria, supply.activo === false ? 'Dado de baja' : supply.bajo_minimo ? 'Bajo mínimo' : null,
                    `Lo usan ${supply.productos_que_lo_usan ?? 0}`].filter(Boolean).join(' · ')}
                </small>
              </div>
              <div className="inventory-supplies__qty">
                <strong>{qtyLabel(supply.existencia, supply.unidad)}</strong>
                <small>mín. {qtyLabel(supply.minimo, supply.unidad)}{showCosts && supply.valor ? ` · ${money(supply.valor)}` : ''}</small>
              </div>
              <div className="inventory-supplies__actions">
                {canEdit && supply.activo !== false && <Button variant="secondary" onClick={() => setMoving({ supply, kind: 'entrada' })}>Entrada</Button>}
                {supply.activo !== false && <Button variant="secondary" onClick={() => setMoving({ supply, kind: 'merma' })}>Merma</Button>}
                {canEdit && supply.activo !== false && <Button variant="ghost" onClick={() => setMoving({ supply, kind: 'ajuste' })}>Ajustar</Button>}
                <Button variant="ghost" onClick={() => setUses(supply)}>Lo usan</Button>
                {canEdit && <Button variant="ghost" onClick={() => setEditing(supply)}>Editar</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MovementSheet token={token} target={moving} showCosts={showCosts} onClose={() => setMoving(null)}
        onDone={async (text) => { setMoving(null); setNotice(text); await refresh(); }} />
      <SupplySheet token={token} target={editing} showCosts={showCosts} onClose={() => setEditing(null)}
        onDone={async (text) => { setEditing(null); setNotice(text); await refresh(); }} />
      <CountSheet token={token} open={counting} supplies={active} onClose={() => setCounting(false)}
        onDone={async (text) => { setCounting(false); setNotice(text); await refresh(); }} />
      <UsesSheet token={token} supply={uses} canEdit={canEdit} products={products} onClose={() => setUses(null)}
        onSaved={async () => { await refresh(); }} />
    </Card>
  );
}

function MovementSheet({ token, target, showCosts, onClose, onDone }: {
  token: string;
  target: { supply: InventoryStock; kind: MovementKind } | null;
  showCosts: boolean;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  // El mismo movimiento reintentado conserva su UUID.
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const cantidad = parseQty(amount)!;
      const costo = parseQty(cost);
      const signature = JSON.stringify([target.supply.id, target.kind, cantidad, costo, note.trim()]);
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      await api.registerInventoryMovement(token, {
        id: attempt.current.id,
        insumo_id: target.supply.id,
        tipo: target.kind,
        cantidad,
        ...(target.kind === 'entrada' && costo !== null ? { costo_unitario: costo } : {}),
        ...(note.trim() ? { nota: note.trim() } : {}),
      });
    },
    onSuccess: async () => {
      attempt.current = null;
      const copy = target ? MOVEMENT_COPY[target.kind].done : 'Listo';
      reset();
      await onDone(`${copy}.`);
    },
  });
  const reset = () => { setAmount(''); setCost(''); setNote(''); save.reset(); };
  const kind = target?.kind ?? 'entrada';
  const copy = MOVEMENT_COPY[kind];
  const quantity = parseQty(amount);
  const short = unitShort(target?.supply.unidad);
  return (
    <AppSheet open={Boolean(target)} onOpenChange={(open) => { if (!open) { reset(); onClose(); } }}
      title={target ? `${copy.title}: ${target.supply.nombre}` : copy.title}
      description={target ? `Hay ${qtyLabel(target.supply.existencia, target.supply.unidad)}.` : undefined}>
      <form className="transaction-form" onSubmit={(event) => { event.preventDefault(); if (validMovement(kind, quantity)) save.mutate(); }}>
        {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
        <Field name="movement-amount" label={`${copy.amount} (${short})`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}
          error={amount.trim() && !validMovement(kind, quantity) ? (kind === 'ajuste' ? 'Escribe una cantidad distinta de cero.' : 'Escribe una cantidad mayor que cero.') : undefined} />
        {kind === 'entrada' && showCosts && (
          <Field name="movement-cost" label={`Costo por ${short} (opcional)`} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
        )}
        <Field name="movement-note" label="Nota (opcional)" placeholder={copy.hint} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button type="submit" loading={save.isPending} disabled={!validMovement(kind, quantity)}>Guardar</Button>
        </div>
      </form>
    </AppSheet>
  );
}

function SupplySheet({ token, target, showCosts, onClose, onDone }: {
  token: string;
  target: InventoryStock | 'nuevo' | null;
  showCosts: boolean;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const editing = target && target !== 'nuevo' ? target : null;
  const formKey = target === null ? 'cerrado' : editing ? `insumo-${editing.id}` : 'nuevo';
  return (
    <AppSheet open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }} title={editing ? `Editar ${editing.nombre}` : 'Agregar insumo'}>
      {target !== null && <SupplyForm key={formKey} token={token} supply={editing} showCosts={showCosts} onCancel={onClose} onDone={onDone} />}
    </AppSheet>
  );
}

function SupplyForm({ token, supply, showCosts, onCancel, onDone }: {
  token: string;
  supply: InventoryStock | null;
  showCosts: boolean;
  onCancel: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [name, setName] = useState(supply?.nombre ?? '');
  const [unit, setUnit] = useState<InventoryUnit>(supply?.unidad ?? 'pieza');
  const [minimum, setMinimum] = useState(supply?.minimo != null ? String(supply.minimo) : '');
  const [cost, setCost] = useState(supply?.costo_unitario ? String(supply.costo_unitario) : '');
  const [initial, setInitial] = useState('');
  const [category, setCategory] = useState(supply?.categoria ?? '');
  const [supplier, setSupplier] = useState(supply?.proveedor_nombre ?? '');
  const [phone, setPhone] = useState(supply?.proveedor_telefono ?? '');
  const key = useRef(createIdempotencyKey());
  const short = unitShort(unit);
  const min = parseQty(minimum) ?? 0;
  const costValue = parseQty(cost);
  const initialValue = parseQty(initial);
  const valid = name.trim().length > 0 && min >= 0 && (costValue === null || costValue >= 0) && (initialValue === null || initialValue >= 0);
  const save = useMutation({
    mutationFn: async () => {
      const base = {
        nombre: name.trim(),
        unidad: unit,
        minimo: min,
        ...(costValue !== null ? { costo_unitario: costValue } : {}),
        categoria: category.trim(),
        proveedor_nombre: supplier.trim(),
        proveedor_telefono: phone.trim(),
      };
      if (supply) await api.updateInventorySupply(token, supply.id, base);
      else await api.createInventorySupply(token, { ...base, ...(initialValue !== null ? { existencia_inicial: initialValue } : {}) }, key.current);
    },
    onSuccess: () => onDone(supply ? `${name.trim()} guardado.` : `${name.trim()} se agregó al inventario.`),
  });
  const toggleActive = useMutation({
    mutationFn: () => api.updateInventorySupply(token, supply!.id, { activo: supply!.activo === false }),
    onSuccess: () => onDone(supply!.activo === false ? `${supply!.nombre} volvió al inventario.` : `${supply!.nombre} quedó dado de baja.`),
  });
  return (
    <form className="transaction-form" onSubmit={(event) => { event.preventDefault(); if (valid) save.mutate(); }}>
      {(save.isError || toggleActive.isError) && <Feedback tone="error">{errorMessage(save.error ?? toggleActive.error)}</Feedback>}
      <Field name="supply-name" label="Nombre" placeholder="Cerveza Corona 355 ml" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      <SelectField name="supply-unit" label="Unidad" value={unit} onChange={(event) => setUnit(event.target.value as InventoryUnit)}
>
        {INVENTORY_UNITS.map((item) => <option key={item.wire} value={item.wire}>{item.label}</option>)}
      </SelectField>
      <Field name="supply-minimum" label={`Mínimo (${short})`} inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} hint="Abajo de esto sale el aviso de bajo mínimo." />
      {showCosts && <Field name="supply-cost" label={`Costo por ${short}`} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />}
      {!supply && <Field name="supply-initial" label={`Hay ahorita (${short})`} inputMode="decimal" value={initial} onChange={(event) => setInitial(event.target.value)} />}
      <Field name="supply-category" label="Etiqueta (opcional)" placeholder="Bebidas" maxLength={40} value={category} onChange={(event) => setCategory(event.target.value)} />
      <Field name="supply-supplier" label="Nombre del proveedor (opcional)" maxLength={80} value={supplier} onChange={(event) => setSupplier(event.target.value)} />
      <Field name="supply-phone" label="Teléfono (opcional)" inputMode="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} />
      <div className="form-actions">
        {supply && (
          <Button type="button" variant="ghost" loading={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
            {supply.activo === false ? 'Volver a darlo de alta' : 'Dar de baja'}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={save.isPending} disabled={!valid}>Guardar</Button>
      </div>
    </form>
  );
}

function CountSheet({ token, open, supplies, onClose, onDone }: {
  token: string;
  open: boolean;
  supplies: InventoryStock[];
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  // Cada renglón conserva su UUID mientras no cambie lo contado.
  const ids = useRef(new Map<string, string>());
  const rows = supplies.flatMap((supply) => {
    const quantity = parseQty(counts[supply.id] ?? '');
    return quantity !== null && quantity >= 0 ? [{ supply, quantity }] : [];
  });
  const invalid = Object.entries(counts).some(([, text]) => text.trim() && (parseQty(text) === null || parseQty(text)! < 0));
  const save = useMutation({
    mutationFn: () => api.registerInventoryCount(token, rows.map(({ supply, quantity }) => {
      const signature = `${supply.id}:${quantity}`;
      let id = ids.current.get(signature);
      if (!id) { id = crypto.randomUUID(); ids.current.set(signature, id); }
      return { id, insumo_id: supply.id, cantidad: quantity };
    }), note),
    onSuccess: async (result) => {
      ids.current.clear();
      setCounts({});
      setNote('');
      const diff = result.con_diferencia ?? 0;
      await onDone(diff === 0 ? 'Conteo guardado: todo cuadró.' : `Conteo guardado: ${diff} ${diff === 1 ? 'insumo no cuadró' : 'insumos no cuadraron'}.`);
    },
  });
  return (
    <AppSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Conteo de fin de turno" description="Escribe lo que hay de cada insumo que cuentes. Lo que dejes vacío no se toca.">
      <form className="transaction-form" onSubmit={(event) => { event.preventDefault(); if (rows.length && !invalid) save.mutate(); }}>
        {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
        <ul className="inventory-count">
          {supplies.map((supply) => (
            <li key={supply.id}>
              <Field name={`count-${supply.id}`} label={`Conteo de ${supply.nombre} (${unitShort(supply.unidad)})`} inputMode="decimal"
                placeholder={`Sistema: ${qtyLabel(supply.existencia, supply.unidad)}`}
                value={counts[supply.id] ?? ''} onChange={(event) => setCounts((current) => ({ ...current, [supply.id]: event.target.value }))} />
            </li>
          ))}
        </ul>
        <Field name="count-note" label="Nota (opcional)" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending} disabled={rows.length === 0 || invalid}>
            {rows.length ? `Guardar conteo (${rows.length})` : 'Guardar conteo'}
          </Button>
        </div>
      </form>
    </AppSheet>
  );
}

function UsesSheet({ token, supply, canEdit, products, onClose, onSaved }: {
  token: string;
  supply: InventoryStock | null;
  canEdit: boolean;
  products: InventoryProduct[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <AppSheet open={Boolean(supply)} onOpenChange={(open) => { if (!open) onClose(); }}
      title={supply ? `Lo usan: ${supply.nombre}` : 'Lo usan'} description="Los productos que gastan este insumo y cuánto gasta cada uno.">
      {supply && <UsesEditor key={supply.id} token={token} supply={supply} canEdit={canEdit} products={products} onSaved={onSaved} />}
    </AppSheet>
  );
}

function UsesEditor({ token, supply, canEdit, products, onSaved }: {
  token: string;
  supply: InventoryStock;
  canEdit: boolean;
  products: InventoryProduct[];
  onSaved: () => Promise<void>;
}) {
  const links = useQuery({ queryKey: ['inventario-lo-usan', supply.id], queryFn: () => api.supplyProducts(token, supply.id) });
  const [draft, setDraft] = useState<{ producto_id: number; nombre: string; cantidad: string }[] | null>(null);
  const [adding, setAdding] = useState('');
  const short = unitShort(supply.unidad);
  const rows = draft ?? (links.data ?? []).map((link) => ({ producto_id: link.producto_id, nombre: link.nombre, cantidad: String(link.cantidad) }));
  const invalid = rows.some((row) => !(parseQty(row.cantidad)! > 0));
  const save = useMutation({
    mutationFn: () => api.saveSupplyProducts(token, supply.id, rows.map((row) => ({ producto_id: row.producto_id, cantidad: parseQty(row.cantidad)! }))),
    onSuccess: async () => { setDraft(null); await links.refetch(); await onSaved(); },
  });
  const available = products.filter((product) => !rows.some((row) => row.producto_id === product.id));
  if (links.isPending) return <p className="inventory-hint">Cargando…</p>;
  if (links.isError) return <Feedback tone="error">{errorMessage(links.error)}</Feedback>;
  return (
    <div className="transaction-form">
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {save.isSuccess && draft === null && <Feedback tone="success">Guardado.</Feedback>}
      {rows.length === 0 ? (
        <p className="inventory-hint">Ningún producto lo gasta todavía.</p>
      ) : (
        <ul className="inventory-uses">
          {rows.map((row, index) => (
            <li key={row.producto_id}>
              <span>{row.nombre}</span>
              {canEdit ? (
                <>
                  <Field name={`uses-${row.producto_id}`} label={`Cuánto gasta ${row.nombre} (${short})`} inputMode="decimal" value={row.cantidad}
                    onChange={(event) => setDraft(rows.map((item, i) => (i === index ? { ...item, cantidad: event.target.value } : item)))} />
                  <Button variant="ghost" aria-label={`Quitar ${row.nombre}`} onClick={() => setDraft(rows.filter((_, i) => i !== index))}>Quitar</Button>
                </>
              ) : (
                <strong>{qtyLabel(parseQty(row.cantidad), supply.unidad)}</strong>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <div className="inventory-uses__add">
            <SelectField name="uses-add" label="Agregar producto" value={adding} onChange={(event) => setAdding(event.target.value)}
>
              <option value="">Elige un producto</option>
              {available.map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}
            </SelectField>
            <Button variant="secondary" disabled={!adding} onClick={() => {
              const product = products.find((item) => item.id === Number(adding));
              if (product) setDraft([...rows, { producto_id: product.id, nombre: product.nombre, cantidad: '1' }]);
              setAdding('');
            }}>Agregar</Button>
          </div>
          <Button loading={save.isPending} disabled={draft === null || invalid} onClick={() => save.mutate()}>Guardar</Button>
        </>
      )}
    </div>
  );
}

