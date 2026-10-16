import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { BusinessSettings, StoreImageKind } from '../types/api';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const KINDS: { kind: StoreImageKind; title: string; help: string; frame: string }[] = [
  {
    kind: 'logo',
    title: 'Logo',
    help: 'Sale en el carrito y en el seguimiento del pedido. Mejor cuadrado y con fondo transparente.',
    frame: 'aspect-square w-32',
  },
  {
    kind: 'foto',
    title: 'Foto del lugar',
    help: 'Sale arriba en "Mis pedidos" y en el directorio. Mejor horizontal, de tu fachada o tu salón.',
    frame: 'aspect-[4/3] w-44',
  },
];

// Logo y foto del negocio. Cada uno se sube o se quita al momento; sin imagen, la app del
// cliente sigue con sus ilustraciones.
export function StoreImagesCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  return (
    <section className="panel-card grid gap-5 p-5 sm:p-6" aria-labelledby="store-images-title">
      <div>
        <h2 id="store-images-title" className="text-xl font-extrabold text-ink">
          Logo y foto de tu negocio
        </h2>
        <p className="mt-1 text-sm text-muted">Tus clientes los ven en la app al pedir. JPG, PNG o WebP de hasta 5 MB.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {KINDS.map((item) => (
          <StoreImagePicker
            key={item.kind}
            token={token}
            scopeId={scopeId}
            url={item.kind === 'logo' ? settings.logo_url ?? null : settings.imagen_url ?? null}
            {...item}
          />
        ))}
      </div>
    </section>
  );
}

function StoreImagePicker({
  token,
  scopeId,
  kind,
  title,
  help,
  frame,
  url,
}: {
  token: string;
  scopeId: string;
  kind: StoreImageKind;
  title: string;
  help: string;
  frame: string;
  url: string | null;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const onSuccess = (data: BusinessSettings) => queryClient.setQueryData(['business-settings', scopeId], data);
  const upload = useMutation({ mutationFn: (file: File) => api.uploadStoreImage(token, kind, file), onSuccess });
  const remove = useMutation({ mutationFn: () => api.deleteStoreImage(token, kind), onSuccess });
  const busy = upload.isPending || remove.isPending;
  const error = fileError ?? (upload.isError ? errorMessage(upload.error) : remove.isError ? errorMessage(remove.error) : null);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setFileError('La imagen debe ser JPG, PNG o WebP.');
    if (file.size > MAX_IMAGE_BYTES) return setFileError('La imagen no puede pesar más de 5 MB.');
    setFileError(null);
    upload.mutate(file);
  }

  return (
    <div className="grid content-start gap-3 rounded-2xl bg-cream p-4">
      <div>
        <p className="text-sm font-extrabold text-ink">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{help}</p>
      </div>
      <div className={`grid place-items-center overflow-hidden rounded-xl bg-white-warm ${frame}`}>
        {url ? (
          <img src={url} alt={`${title} actual`} className={kind === 'logo' ? 'size-full object-contain' : 'size-full object-cover'} />
        ) : (
          <ImageIcon aria-hidden="true" className="size-8 text-muted" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <UploadCloud aria-hidden="true" className="size-4" />
          {upload.isPending ? 'Subiendo…' : url ? 'Cambiar' : 'Subir'}
        </Button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label={`Elegir ${title.toLocaleLowerCase('es')}`}
          accept={IMAGE_TYPES.join(',')}
          onChange={(event) => {
            choose(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        {url && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => remove.mutate()}>
            <Trash2 aria-hidden="true" className="size-4" /> Quitar
          </Button>
        )}
      </div>
      {error && <Feedback tone="error">{error}</Feedback>}
    </div>
  );
}
