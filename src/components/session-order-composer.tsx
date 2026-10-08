import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { CatalogProduct, SpaceAccountGroup } from '../types/api';
import { Button, Feedback, Field, SelectField } from './ui';

interface DraftLine {
  productId: number;
  productName: string;
  quantity: number;
  optionIds: number[];
}

function defaultSelections(product: CatalogProduct): Record<number, number[]> {
  return Object.fromEntries(product.grupos_opcion.map((group) => [
    group.id,
    group.min_selecciones === 1 && group.max_selecciones === 1 && group.opciones[0]
      ? [group.opciones[0].id]
      : [],
  ]));
}

export function SessionOrderComposer({
  token,
  spaceId,
  sessionId,
  groups,
  onCreated,
}: {
  token: string;
  spaceId: number;
  sessionId: string;
  groups: SpaceAccountGroup[];
  onCreated: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: ['catalog-for-session-order', spaceId],
    queryFn: () => api.catalog(token),
    enabled: Boolean(token && sessionId),
    retry: false,
  });
  const [participantId, setParticipantId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selection, setSelection] = useState<Record<number, number[]>>({});
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const product = catalog.data?.productos.find((item) => String(item.id) === productId) ?? null;
  const availableProducts = useMemo(
    () => catalog.data?.productos.filter((item) => item.disponible) ?? [],
    [catalog.data?.productos],
  );
  const participants = groups.filter((group) => Boolean(group.participante_id));

  const createOrder = useMutation({
    mutationFn: () => api.createSessionOrder(token, spaceId, {
      sessionId,
      participantId: participantId || null,
      items: draft.map((line) => ({ producto_id: line.productId, cantidad: line.quantity, opcion_ids: line.optionIds })),
    }, crypto.randomUUID()),
    onSuccess: async () => {
      setDraft([]);
      setNotice('Pedido agregado a la cuenta de esta mesa.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['space-session', spaceId] }),
        queryClient.invalidateQueries({ queryKey: ['space-availability'] }),
        queryClient.invalidateQueries({ queryKey: ['mesero-board'] }),
        onCreated(),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  function selectProduct(value: string) {
    setProductId(value);
    const next = availableProducts.find((item) => String(item.id) === value);
    setSelection(next ? defaultSelections(next) : {});
    setError(null);
  }

  function toggleOption(groupId: number, optionId: number, max: number) {
    setSelection((current) => {
      const selected = current[groupId] ?? [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : selected.length >= max
          ? selected
          : [...selected, optionId];
      return { ...current, [groupId]: next };
    });
  }

  function addProduct() {
    if (!product) return;
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > 20) {
      setError('La cantidad debe estar entre 1 y 20.');
      return;
    }
    for (const group of product.grupos_opcion) {
      const count = selection[group.id]?.length ?? 0;
      if (count < group.min_selecciones || count > group.max_selecciones) {
        setError(`${group.nombre}: elige entre ${group.min_selecciones} y ${group.max_selecciones}.`);
        return;
      }
    }
    setDraft((current) => [...current, {
      productId: product.id,
      productName: product.nombre,
      quantity: amount,
      optionIds: Object.values(selection).flat(),
    }]);
    setError(null);
    setNotice(null);
  }

  return (
    <section className="session-order-composer" aria-label="Agregar pedido a la sesión">
      <p className="eyebrow">Agregar pedido a esta sesión</p>
      <SelectField
        label="Para"
        name="session-order-participant"
        value={participantId}
        onChange={(event) => setParticipantId(event.target.value)}
      >
        <option value="">Pedido general</option>
        {participants.map((group) => {
          const id = group.participante_id;
          return id ? <option key={id} value={id}>{group.etiqueta}</option> : null;
        })}
      </SelectField>
      {catalog.isPending ? <p className="space-account__hint">Cargando productos…</p> : null}
      {catalog.isError ? <Feedback tone="error">No se pudo cargar el menú para esta mesa.</Feedback> : null}
      <SelectField
        label="Producto"
        name="session-order-product"
        value={productId}
        onChange={(event) => selectProduct(event.target.value)}
      >
        <option value="">Elige un producto</option>
        {availableProducts.map((item) => (
          <option key={item.id} value={item.id}>{item.nombre}</option>
        ))}
      </SelectField>
      {product?.grupos_opcion.map((group) => (
        <fieldset className="session-order-composer__options" key={group.id}>
          <legend>{group.nombre} · elige {group.min_selecciones}–{group.max_selecciones}</legend>
          {group.opciones.map((option) => {
            const checked = selection[group.id]?.includes(option.id) ?? false;
            return (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && (selection[group.id]?.length ?? 0) >= group.max_selecciones}
                  onChange={() => toggleOption(group.id, option.id, group.max_selecciones)}
                />
                <span>{option.nombre}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <Field
        label="Cantidad"
        name="session-order-quantity"
        inputMode="numeric"
        type="number"
        min={1}
        max={20}
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <Button type="button" variant="secondary" disabled={!product} onClick={addProduct}>
        <Plus aria-hidden="true" className="size-5" /> Agregar producto
      </Button>
      {draft.length > 0 ? (
        <ul className="session-order-composer__draft" aria-label="Productos del nuevo pedido">
          {draft.map((line, index) => (
            <li key={`${line.productId}:${index}`}>
              <span>{line.quantity}× {line.productName}</span>
              <button type="button" aria-label={`Quitar ${line.productName}`} onClick={() => setDraft((items) => items.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <Feedback tone="error">{error}</Feedback> : null}
      {notice ? <Feedback tone="success">{notice}</Feedback> : null}
      <Button type="button" variant="dark" loading={createOrder.isPending} disabled={draft.length === 0 || !sessionId} onClick={() => createOrder.mutate()}>
        Enviar a la cuenta
      </Button>
    </section>
  );
}
