import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers3,
  NotebookTabs,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { calculateDigitalPrice } from '../lib/catalog-pricing';
import { formatMoney } from '../lib/money';
import type { CatalogCategory, CatalogProduct, CatalogProductInput } from '../types/api';

const moneyPattern = /^\d{1,8}\.\d{2}$/;
const maxProductImageBytes = 5 * 1024 * 1024;
const productImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const categorySchema = z.object({
  nombre: z.string().trim().min(1, 'Captura el nombre.').max(80),
  orden: z.number().int().min(0).max(9999),
});

const optionSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, 'Captura el nombre de la opción.').max(80),
  precio_extra: z.string().regex(moneyPattern, 'Usa pesos con dos decimales.'),
});

const optionGroupSchema = z
  .object({
    id: z.number().int().positive().optional(),
    nombre: z.string().trim().min(1, 'Captura el nombre del grupo.').max(80),
    min_selecciones: z.number().int().min(0).max(20),
    max_selecciones: z.number().int().min(1).max(20),
    opciones: z.array(optionSchema).min(1, 'Agrega al menos una opción.').max(20),
  })
  .superRefine((group, context) => {
    if (
      group.min_selecciones > group.max_selecciones ||
      group.max_selecciones > group.opciones.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_selecciones'],
        message: 'Debe ser mayor o igual al mínimo y no superar las opciones.',
      });
    }
  });

const productSchema = z.object({
  categoria_id: z.number().int().positive('Selecciona una categoría.'),
  estacion_preparacion: z.enum(['cocina', 'caja']),
  nombre: z.string().trim().min(1, 'Captura el nombre.').max(120),
  descripcion: z.string().trim().max(1000),
  ingredientes: z.string().trim().max(1000),
  alergenos: z.string().trim().max(500),
  tiempo_estimado_min: z.number().int().min(0).max(240),
  precio_mostrador: z.string().regex(moneyPattern, 'Usa pesos con dos decimales.'),
  disponible: z.boolean(),
  grupos_opcion: z.array(optionGroupSchema).max(12),
});

type CategoryForm = z.infer<typeof categorySchema>;
type ProductForm = z.infer<typeof productSchema>;
type AvailabilityFilter = 'todos' | 'disponibles' | 'ocultos';

export function MenuPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('es-MX'));
  const [categoryFilter, setCategoryFilter] = useState<number | 'todos'>('todos');
  const [availability, setAvailability] = useState<AvailabilityFilter>('todos');
  const [categoryEditor, setCategoryEditor] = useState<CatalogCategory | 'new' | null>(null);
  const [productEditor, setProductEditor] = useState<CatalogProduct | 'new' | null>(null);
  const [availabilityProduct, setAvailabilityProduct] = useState<CatalogProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ['catalog', scopeId],
    queryFn: () => api.catalog(token),
    enabled: Boolean(token),
  });

  const categories = useMemo(
    () => [...(catalog.data?.categorias ?? [])].sort((a, b) => a.orden - b.orden),
    [catalog.data?.categorias],
  );

  const products = useMemo(() => {
    return (catalog.data?.productos ?? []).filter((product) => {
      const matchesSearch =
        deferredSearch === '' ||
        product.nombre.toLocaleLowerCase('es-MX').includes(deferredSearch) ||
        product.descripcion?.toLocaleLowerCase('es-MX').includes(deferredSearch);
      const matchesCategory = categoryFilter === 'todos' || product.categoria_id === categoryFilter;
      const matchesAvailability =
        availability === 'todos' ||
        (availability === 'disponibles' ? product.disponible : !product.disponible);
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [availability, catalog.data?.productos, categoryFilter, deferredSearch]);

  async function refresh(message: string) {
    await queryClient.invalidateQueries({ queryKey: ['catalog', scopeId] });
    setNotice(message);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administración"
        title="Menú"
        description="Organiza lo que vende la tienda, sus precios, preparación y opciones. El precio digital oficial siempre lo calcula el backend."
        action={
          <Button
            disabled={categories.length === 0}
            title={categories.length === 0 ? 'Primero crea una categoría.' : undefined}
            onClick={() => {
              setProductEditor('new');
              setNotice(null);
            }}
          >
            <Plus aria-hidden="true" className="size-5" /> Nuevo producto
          </Button>
        }
      />

      {notice && <Feedback tone="success">{notice}</Feedback>}
      {catalog.isError && (
        <Feedback tone="error">
          <div className="feedback-with-action">
            <span>{errorMessage(catalog.error)}</span>
            <Button variant="ghost" onClick={() => void catalog.refetch()}>
              Reintentar
            </Button>
          </div>
        </Feedback>
      )}

      <div className="menu-toolbar">
        <div className="search-box menu-search">
          <Search aria-hidden="true" />
          <label htmlFor="menu-search" className="sr-only">
            Buscar productos
          </label>
          <input
            id="menu-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o descripción"
          />
        </div>
        <div className="filter-bar" role="group" aria-label="Disponibilidad del producto">
          {(['todos', 'disponibles', 'ocultos'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${availability === value ? 'filter-chip--active' : ''}`}
              aria-pressed={availability === value}
              onClick={() => setAvailability(value)}
            >
              {value === 'todos' ? 'Todos' : value === 'disponibles' ? 'Disponibles' : 'Ocultos'}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-layout">
        <aside className="category-panel" aria-label="Categorías del menú">
          <div className="category-panel__header">
            <div>
              <p className="eyebrow">Organización</p>
              <h2>Categorías</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Crear categoría"
              title="Crear categoría"
              onClick={() => setCategoryEditor('new')}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className={`category-row ${categoryFilter === 'todos' ? 'category-row--active' : ''}`}
            aria-pressed={categoryFilter === 'todos'}
            onClick={() => setCategoryFilter('todos')}
          >
            <span>Todo el menú</span>
            <strong>{catalog.data?.productos.length ?? 0}</strong>
          </button>

          <div className="category-list">
            {categories.map((category) => {
              const count =
                catalog.data?.productos.filter((product) => product.categoria_id === category.id)
                  .length ?? 0;
              return (
                <div
                  key={category.id}
                  className={`category-row category-row--split ${
                    categoryFilter === category.id ? 'category-row--active' : ''
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={categoryFilter === category.id}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    <span>{category.nombre}</span>
                    <strong>{count}</strong>
                  </button>
                  <button
                    type="button"
                    className="category-row__edit"
                    aria-label={`Editar categoría ${category.nombre}`}
                    title="Editar categoría"
                    onClick={() => setCategoryEditor(category)}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {!catalog.isPending && categories.length === 0 && (
            <div className="category-panel__empty">
              <p>Crea la primera categoría para poder agregar productos.</p>
              <Button variant="secondary" onClick={() => setCategoryEditor('new')}>
                Crear categoría
              </Button>
            </div>
          )}
        </aside>

        <section className="menu-products" aria-labelledby="menu-products-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Catálogo de la tienda</p>
              <h2 id="menu-products-title">Productos</h2>
            </div>
            <span className="section-count" aria-live="polite">
              {products.length} {products.length === 1 ? 'producto' : 'productos'}
            </span>
          </div>

          {catalog.isPending ? (
            <div className="product-grid" aria-label="Cargando productos">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="product-card product-card--skeleton" />
              ))}
            </div>
          ) : products.length ? (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  category={categories.find((category) => category.id === product.categoria_id)}
                  onEdit={() => setProductEditor(product)}
                  onAvailability={() => setAvailabilityProduct(product)}
                />
              ))}
            </div>
          ) : !catalog.isError ? (
            <EmptyState
              icon={<NotebookTabs aria-hidden="true" />}
              title={catalog.data?.productos.length ? 'No hay coincidencias' : 'Tu menú está vacío'}
              description={
                catalog.data?.productos.length
                  ? 'Cambia la búsqueda o los filtros para volver a ver productos.'
                  : categories.length
                    ? 'Crea el primer producto y decide si se publica de inmediato.'
                    : 'Primero crea una categoría; después podrás agregar productos.'
              }
              action={
                categories.length ? (
                  <Button onClick={() => setProductEditor('new')}>Crear producto</Button>
                ) : (
                  <Button onClick={() => setCategoryEditor('new')}>Crear categoría</Button>
                )
              }
            />
          ) : null}
        </section>
      </div>

      <CategoryFormModal
        key={`category-${categoryEditor === 'new' ? 'new' : (categoryEditor?.id ?? 'closed')}`}
        open={categoryEditor !== null}
        category={categoryEditor === 'new' ? null : categoryEditor}
        token={token}
        onOpenChange={(open) => {
          if (!open) setCategoryEditor(null);
        }}
        onSaved={async (editing) => {
          setCategoryEditor(null);
          await refresh(editing ? 'Categoría actualizada.' : 'Categoría creada. Ya puedes usarla.');
        }}
      />

      <ProductFormModal
        key={`product-${productEditor === 'new' ? 'new' : (productEditor?.id ?? 'closed')}`}
        open={productEditor !== null}
        product={productEditor === 'new' ? null : productEditor}
        categories={categories}
        token={token}
        onOpenChange={(open) => {
          if (!open) setProductEditor(null);
        }}
        onSaved={async (editing) => {
          setProductEditor(null);
          await refresh(editing ? 'Producto actualizado.' : 'Producto creado y agregado al menú.');
        }}
      />

      <AvailabilityModal
        key={`availability-${availabilityProduct?.id ?? 'closed'}`}
        product={availabilityProduct}
        token={token}
        onOpenChange={(open) => {
          if (!open) setAvailabilityProduct(null);
        }}
        onChanged={async (disponible) => {
          setAvailabilityProduct(null);
          await refresh(
            disponible
              ? 'Producto publicado y disponible para pedidos.'
              : 'Producto ocultado; ya no aparecerá para clientes.',
          );
        }}
      />
    </div>
  );
}

function ProductCard({
  product,
  category,
  onEdit,
  onAvailability,
}: {
  product: CatalogProduct;
  category?: CatalogCategory;
  onEdit: () => void;
  onAvailability: () => void;
}) {
  return (
    <article className={`product-card ${!product.disponible ? 'product-card--hidden' : ''}`}>
      <div className="product-card__media">
        <ImageIcon aria-hidden="true" />
        {product.imagen_url && (
          <img
            src={product.imagen_url}
            alt={`Imagen de ${product.nombre}`}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        <span
          className={`availability-badge ${
            product.disponible ? 'availability-badge--on' : 'availability-badge--off'
          }`}
        >
          {product.disponible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {product.disponible ? 'Disponible' : 'Oculto'}
        </span>
      </div>
      <div className="product-card__body">
        <div className="product-card__meta">
          <span>{category?.nombre ?? 'Sin categoría'}</span>
          <span>{product.estacion_preparacion === 'cocina' ? 'Cocina' : 'Caja'}</span>
        </div>
        <h3>{product.nombre}</h3>
        <p className="product-card__description">
          {product.descripcion || 'Sin descripción para clientes.'}
        </p>
        <dl className="product-card__prices">
          <div>
            <dt>Mostrador</dt>
            <dd>{formatMoney(product.precio_mostrador)}</dd>
          </div>
          <div>
            <dt>Digital</dt>
            <dd>{formatMoney(product.precio_digital)}</dd>
          </div>
        </dl>
        <div className="product-card__details">
          <span>{product.tiempo_estimado_min} min</span>
          <span>
            {product.grupos_opcion.length}{' '}
            {product.grupos_opcion.length === 1 ? 'grupo de opciones' : 'grupos de opciones'}
          </span>
        </div>
      </div>
      <div className="product-card__actions">
        <Button variant="secondary" onClick={onEdit}>
          <Pencil aria-hidden="true" className="size-4" /> Editar
        </Button>
        <Button variant="ghost" onClick={onAvailability}>
          {product.disponible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
          {product.disponible ? 'Ocultar' : 'Publicar'}
        </Button>
      </div>
    </article>
  );
}

function CategoryFormModal({
  open,
  category,
  token,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  category: CatalogCategory | null;
  token: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (editing: boolean) => Promise<void>;
}) {
  const editing = category !== null;
  const form = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? { nombre: category.nombre, orden: category.orden }
      : { nombre: '', orden: 0 },
  });
  const mutation = useMutation({
    mutationFn: (input: CategoryForm) =>
      editing ? api.updateCategory(token, category.id, input) : api.createCategory(token, input),
    onSuccess: () => onSaved(editing),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Editar categoría' : 'Crear categoría'}
      description="El orden más bajo aparece primero en el menú. Una categoría con productos no se elimina desde esta pantalla."
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form
        className="space-y-5"
        onSubmit={(event) => void form.handleSubmit((data) => mutation.mutate(data))(event)}
      >
        <Field
          label="Nombre *"
          autoFocus
          error={form.formState.errors.nombre?.message}
          {...form.register('nombre')}
        />
        <Field
          label="Orden *"
          type="number"
          min={0}
          max={9999}
          inputMode="numeric"
          hint="Ejemplo: 0 aparece antes que 10."
          error={form.formState.errors.orden?.message}
          {...form.register('orden', { valueAsNumber: true })}
        />
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProductFormModal({
  open,
  product,
  categories,
  token,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  product: CatalogProduct | null;
  categories: CatalogCategory[];
  token: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (editing: boolean) => Promise<void>;
}) {
  const editing = product !== null;
  const queryClient = useQueryClient();
  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: productDefaults(product, categories[0]?.id ?? 0),
  });
  const groups = useFieldArray({
    control: form.control,
    name: 'grupos_opcion',
    keyName: 'fieldKey',
  });
  const counterPrice = useWatch({
    control: form.control,
    name: 'precio_mostrador',
  });
  const digitalPrice = calculateDigitalPrice(counterPrice);
  const imageInputId = useId();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [saveStage, setSaveStage] = useState<'product' | 'image'>('product');
  const [createdProductId, setCreatedProductId] = useState<number | null>(null);
  const previewUrl =
    selectedImageUrl ?? (removeExistingImage ? null : (product?.imagen_url ?? null));

  useEffect(() => {
    return () => {
      if (selectedImageUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(selectedImageUrl);
      }
    };
  }, [selectedImageUrl]);

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!productImageTypes.has(file.type)) {
      setImageError('Elige una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > maxProductImageBytes) {
      setImageError('La imagen no puede pesar más de 5 MB.');
      return;
    }
    setSelectedImage(file);
    setSelectedImageUrl(
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null,
    );
    setRemoveExistingImage(false);
    setImageError(null);
  }

  function removeImage() {
    setSelectedImage(null);
    setSelectedImageUrl(null);
    setRemoveExistingImage(Boolean(product?.imagen_url));
    setImageError(null);
  }

  const mutation = useMutation({
    mutationFn: async (input: ProductForm) => {
      setSaveStage('product');
      const payload = toProductInput(input);
      const existingProductId = product?.id ?? createdProductId;
      const saved = await (existingProductId
        ? api.updateProduct(token, existingProductId, payload)
        : api.createProduct(token, payload));
      if (!existingProductId) setCreatedProductId(saved.id);
      if (selectedImage) {
        setSaveStage('image');
        try {
          return await api.uploadProductImage(token, saved.id, selectedImage);
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: ['catalog'] });
          throw error;
        }
      }
      if (editing && removeExistingImage && product.imagen_url) {
        setSaveStage('image');
        try {
          return await api.deleteProductImage(token, saved.id);
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: ['catalog'] });
          throw error;
        }
      }
      return saved;
    },
    onSuccess: () => onSaved(editing),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="dialog-content--wide"
      title={editing ? `Editar ${product.nombre}` : 'Crear producto'}
      description="Configura lo que verá el cliente. Los campos con * son obligatorios."
    >
      {mutation.isError && (
        <Feedback tone="error">
          {saveStage === 'image' ? (
            <>
              <strong>El producto se guardó, pero el cambio de imagen no terminó.</strong>{' '}
              {errorMessage(mutation.error)} Puedes volver a intentarlo sin perder los datos.
            </>
          ) : (
            errorMessage(mutation.error)
          )}
        </Feedback>
      )}
      <form
        className="product-form"
        onSubmit={(event) => void form.handleSubmit((data) => mutation.mutate(data))(event)}
      >
        <section className="form-section" aria-labelledby="product-basic-heading">
          <div className="form-section__heading">
            <span>1</span>
            <div>
              <h3 id="product-basic-heading">Información básica</h3>
              <p>Nombre, ubicación en el menú y área que lo prepara.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="Nombre *"
              autoFocus
              error={form.formState.errors.nombre?.message}
              {...form.register('nombre')}
            />
            <label className="field">
              <span className="field__label">Categoría *</span>
              <select
                className="field__control"
                {...form.register('categoria_id', { valueAsNumber: true })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Estación de preparación *</span>
              <select className="field__control" {...form.register('estacion_preparacion')}>
                <option value="caja">Caja</option>
                <option value="cocina">Cocina</option>
              </select>
            </label>
            <Field
              label="Tiempo estimado (minutos) *"
              type="number"
              min={0}
              max={240}
              inputMode="numeric"
              error={form.formState.errors.tiempo_estimado_min?.message}
              {...form.register('tiempo_estimado_min', { valueAsNumber: true })}
            />
            <TextAreaField
              className="form-grid__wide"
              label="Descripción para clientes"
              maxLength={1000}
              error={form.formState.errors.descripcion?.message}
              registration={form.register('descripcion')}
            />
          </div>
        </section>

        <section className="form-section" aria-labelledby="product-price-heading">
          <div className="form-section__heading">
            <span>2</span>
            <div>
              <h3 id="product-price-heading">Precio</h3>
              <p>Captura el precio de mostrador; el digital se calcula automáticamente.</p>
            </div>
          </div>
          <div className="price-editor">
            <Field
              label="Precio de mostrador *"
              inputMode="decimal"
              placeholder="20.00"
              hint="Usa pesos con dos decimales."
              error={form.formState.errors.precio_mostrador?.message}
              {...form.register('precio_mostrador')}
            />
            <div className="digital-price-preview" aria-live="polite">
              <span>Precio digital estimado</span>
              <strong>{digitalPrice ? formatMoney(digitalPrice) : '—'}</strong>
              <small>El backend confirmará y guardará el precio oficial.</small>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="product-detail-heading">
          <div className="form-section__heading">
            <span>3</span>
            <div>
              <h3 id="product-detail-heading">Detalles e imagen</h3>
              <p>Información útil para decidir y preparar el producto.</p>
            </div>
          </div>
          <div className="form-grid">
            <TextAreaField
              label="Ingredientes"
              maxLength={1000}
              error={form.formState.errors.ingredientes?.message}
              registration={form.register('ingredientes')}
            />
            <TextAreaField
              label="Alérgenos"
              maxLength={500}
              error={form.formState.errors.alergenos?.message}
              registration={form.register('alergenos')}
            />
            <div className="form-grid__wide product-image-uploader">
              <div className="product-image-uploader__copy">
                <span className="field__label">Imagen del producto</span>
                <p id={`${imageInputId}-hint`}>
                  Opcional. Usa JPG, PNG o WebP de hasta 5 MB. La guardaremos en Vaiinilla.
                </p>
                <div className="product-image-uploader__actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <UploadCloud aria-hidden="true" className="size-4" />
                    {previewUrl ? 'Cambiar imagen' : 'Elegir imagen'}
                  </Button>
                  <input
                    ref={imageInputRef}
                    id={imageInputId}
                    className="sr-only"
                    type="file"
                    aria-label="Elegir imagen"
                    accept="image/jpeg,image/png,image/webp"
                    aria-describedby={`${imageInputId}-hint${imageError ? ` ${imageInputId}-error` : ''}`}
                    onChange={(event) => {
                      chooseImage(event.currentTarget.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                  {previewUrl && (
                    <Button type="button" variant="ghost" onClick={removeImage}>
                      <Trash2 aria-hidden="true" className="size-4" /> Quitar imagen
                    </Button>
                  )}
                  {removeExistingImage && !selectedImage && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setRemoveExistingImage(false)}
                    >
                      <RotateCcw aria-hidden="true" className="size-4" /> Conservar actual
                    </Button>
                  )}
                </div>
                {selectedImage && (
                  <p className="product-image-uploader__file" role="status">
                    <strong>{selectedImage.name}</strong>
                    <span>{formatFileSize(selectedImage.size)}</span>
                  </p>
                )}
                {removeExistingImage && !selectedImage && (
                  <p className="product-image-uploader__file" role="status">
                    La imagen actual se quitará al guardar.
                  </p>
                )}
                {imageError && (
                  <p id={`${imageInputId}-error`} className="field__error" role="alert">
                    {imageError}
                  </p>
                )}
              </div>
              <div
                className={`product-image-dropzone ${isDraggingImage ? 'product-image-dropzone--active' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsDraggingImage(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingImage(false);
                  chooseImage(event.dataTransfer.files[0]);
                }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Vista previa de ${form.getValues('nombre') || 'producto'}`}
                  />
                ) : (
                  <>
                    <ImageIcon aria-hidden="true" />
                    <strong>Arrastra una imagen aquí</strong>
                    <span>o usa el botón para elegirla</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="product-options-heading">
          <div className="form-section__heading form-section__heading--action">
            <span>4</span>
            <div>
              <h3 id="product-options-heading">Variantes y extras</h3>
              <p>Ejemplos: tamaño, tipo de leche o toppings. Este paso es opcional.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                groups.append({
                  nombre: '',
                  min_selecciones: 0,
                  max_selecciones: 1,
                  opciones: [{ nombre: '', precio_extra: '0.00' }],
                })
              }
            >
              <Plus aria-hidden="true" className="size-4" /> Agregar grupo
            </Button>
          </div>

          {groups.fields.length === 0 ? (
            <div className="option-groups-empty">
              <Layers3 aria-hidden="true" />
              <div>
                <strong>Este producto no tiene variantes.</strong>
                <p>Puedes guardarlo así o agregar opciones si el cliente debe elegir algo.</p>
              </div>
            </div>
          ) : (
            <div className="option-groups">
              {groups.fields.map((group, index) => (
                <OptionGroupFields
                  key={group.fieldKey}
                  index={index}
                  form={form}
                  onRemove={() => groups.remove(index)}
                />
              ))}
            </div>
          )}
        </section>

        <label className="checkbox-field product-availability-field">
          <input type="checkbox" {...form.register('disponible')} />
          <span>
            <strong>Publicar al guardar</strong>
            <small>Si lo desactivas, el producto se conserva pero no aparecerá a clientes.</small>
          </span>
        </label>

        <div className="form-actions product-form__actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {mutation.isPending && saveStage === 'image'
              ? 'Subiendo imagen…'
              : editing
                ? 'Guardar producto'
                : 'Crear producto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OptionGroupFields({
  index,
  form,
  onRemove,
}: {
  index: number;
  form: UseFormReturn<ProductForm>;
  onRemove: () => void;
}) {
  const options = useFieldArray({
    control: form.control,
    name: `grupos_opcion.${index}.opciones`,
    keyName: 'fieldKey',
  });
  const errors = form.formState.errors.grupos_opcion?.[index];

  return (
    <fieldset className="option-group-card">
      <legend className="sr-only">Grupo de opciones {index + 1}</legend>
      <div className="option-group-card__header">
        <strong>Grupo {index + 1}</strong>
        <Button type="button" variant="ghost" onClick={onRemove}>
          <Trash2 aria-hidden="true" className="size-4" /> Quitar grupo
        </Button>
      </div>
      <div className="form-grid option-group-card__settings">
        <Field
          label="Nombre del grupo *"
          placeholder="Ejemplo: Tipo de leche"
          error={errors?.nombre?.message}
          {...form.register(`grupos_opcion.${index}.nombre`)}
        />
        <div className="selection-limits">
          <Field
            label="Mínimo *"
            type="number"
            min={0}
            max={20}
            inputMode="numeric"
            error={errors?.min_selecciones?.message}
            {...form.register(`grupos_opcion.${index}.min_selecciones`, {
              valueAsNumber: true,
            })}
          />
          <Field
            label="Máximo *"
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            error={errors?.max_selecciones?.message}
            {...form.register(`grupos_opcion.${index}.max_selecciones`, {
              valueAsNumber: true,
            })}
          />
        </div>
      </div>

      <div className="option-list">
        <div className="option-list__heading">
          <span>Opciones</span>
          <button
            type="button"
            onClick={() => options.append({ nombre: '', precio_extra: '0.00' })}
          >
            <Plus aria-hidden="true" /> Agregar opción
          </button>
        </div>
        {typeof errors?.opciones?.message === 'string' && (
          <p className="field__error">{errors.opciones.message}</p>
        )}
        {options.fields.map((option, optionIndex) => (
          <div className="option-row" key={option.fieldKey}>
            <Field
              label={`Opción ${optionIndex + 1} *`}
              placeholder="Ejemplo: Deslactosada"
              error={errors?.opciones?.[optionIndex]?.nombre?.message}
              {...form.register(`grupos_opcion.${index}.opciones.${optionIndex}.nombre`)}
            />
            <Field
              label="Costo extra *"
              inputMode="decimal"
              placeholder="0.00"
              error={errors?.opciones?.[optionIndex]?.precio_extra?.message}
              {...form.register(`grupos_opcion.${index}.opciones.${optionIndex}.precio_extra`)}
            />
            <button
              type="button"
              className="option-row__remove"
              aria-label={`Quitar opción ${optionIndex + 1}`}
              title="Quitar opción"
              disabled={options.fields.length === 1}
              onClick={() => options.remove(optionIndex)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function AvailabilityModal({
  product,
  token,
  onOpenChange,
  onChanged,
}: {
  product: CatalogProduct | null;
  token: string;
  onOpenChange: (open: boolean) => void;
  onChanged: (disponible: boolean) => Promise<void>;
}) {
  const nextAvailability = !product?.disponible;
  const mutation = useMutation({
    mutationFn: () => api.changeProductAvailability(token, product?.id ?? 0, nextAvailability),
    onSuccess: () => onChanged(nextAvailability),
  });

  return (
    <Modal
      open={product !== null}
      onOpenChange={onOpenChange}
      title={`${nextAvailability ? 'Publicar' : 'Ocultar'} ${product?.nombre ?? 'producto'}`}
      description={
        nextAvailability
          ? 'El producto volverá a aparecer para clientes y podrá incluirse en pedidos nuevos.'
          : 'El producto se conserva para el historial, pero deja de aparecer y no podrá pedirse.'
      }
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant={nextAvailability ? 'primary' : 'danger'}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {nextAvailability ? 'Publicar producto' : 'Ocultar producto'}
        </Button>
      </div>
    </Modal>
  );
}

function TextAreaField({
  label,
  error,
  registration,
  maxLength,
  className = '',
}: {
  label: string;
  error?: string;
  registration: ReturnType<UseFormReturn<ProductForm>['register']>;
  maxLength: number;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      <textarea
        className={`field__control min-h-24 resize-y ${error ? 'field__control--error' : ''}`}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        {...registration}
      />
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

function productDefaults(product: CatalogProduct | null, fallbackCategoryId: number): ProductForm {
  if (!product) {
    return {
      categoria_id: fallbackCategoryId,
      estacion_preparacion: 'caja',
      nombre: '',
      descripcion: '',
      ingredientes: '',
      alergenos: '',
      tiempo_estimado_min: 5,
      precio_mostrador: '',
      disponible: true,
      grupos_opcion: [],
    };
  }
  return {
    categoria_id: product.categoria_id,
    estacion_preparacion: product.estacion_preparacion,
    nombre: product.nombre,
    descripcion: product.descripcion ?? '',
    ingredientes: product.ingredientes ?? '',
    alergenos: product.alergenos ?? '',
    tiempo_estimado_min: product.tiempo_estimado_min,
    precio_mostrador: product.precio_mostrador,
    disponible: product.disponible,
    grupos_opcion: product.grupos_opcion.map((group) => ({
      id: group.id,
      nombre: group.nombre,
      min_selecciones: group.min_selecciones,
      max_selecciones: group.max_selecciones,
      opciones: group.opciones.map((option) => ({
        id: option.id,
        nombre: option.nombre,
        precio_extra: option.precio_extra,
      })),
    })),
  };
}

function toProductInput(form: ProductForm): CatalogProductInput {
  return {
    ...form,
    descripcion: form.descripcion || null,
    ingredientes: form.ingredientes || null,
    alergenos: form.alergenos || null,
    grupos_opcion: form.grupos_opcion.map((group) => ({
      ...(group.id === undefined ? {} : { id: group.id }),
      nombre: group.nombre,
      min_selecciones: group.min_selecciones,
      max_selecciones: group.max_selecciones,
      opciones: group.opciones.map((option) => ({
        ...(option.id === undefined ? {} : { id: option.id }),
        nombre: option.nombre,
        precio_extra: option.precio_extra,
      })),
    })),
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
