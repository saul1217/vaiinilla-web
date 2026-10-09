import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, Feedback, Field } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { BusinessSettings, StoreVideo } from '../types/api';

const MAX_VIDEOS = 5;
const TITULO_MAX = 60;

/** Mismas reglas que el backend: título corto y enlace https. */
function videoError(titulo: string, url: string): string | null {
  if (titulo.trim().length === 0 || titulo.trim().length > TITULO_MAX)
    return `Escribe un título de hasta ${TITULO_MAX} caracteres.`;
  try {
    if (new URL(url.trim()).protocol !== 'https:') return "La dirección debe empezar con 'https://'.";
  } catch {
    return 'Escribe una dirección válida, por ejemplo https://www.youtube.com/...';
  }
  return null;
}

// Videos del local: enlaces que la página del negocio muestra en la PWA. Se guardan con su
// propio botón, sin tocar el resto del flujo.
export function StoreVideosCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  const queryClient = useQueryClient();
  const saved = settings.videos_local ?? [];
  const [draft, setDraft] = useState<StoreVideo[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const videos = draft ?? saved;

  const save = useMutation({
    mutationFn: (lista: StoreVideo[]) => api.saveBusinessSettings(token, { videos_local: lista }),
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings', scopeId], data);
      setDraft(null);
    },
  });

  function agregar(event: FormEvent) {
    event.preventDefault();
    const error = videoError(titulo, url);
    setFormError(error);
    if (error) return;
    setDraft([...videos, { titulo: titulo.trim(), url: url.trim() }]);
    setTitulo('');
    setUrl('');
  }

  return (
    <section className="panel-card grid gap-5 p-5 sm:p-6" aria-labelledby="store-videos-title">
      <div>
        <h2 id="store-videos-title" className="text-xl font-extrabold text-ink">
          Videos de tu local
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pega enlaces de YouTube u otro sitio para que tus clientes los vean en tu página (hasta {MAX_VIDEOS}).
        </p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {save.isSuccess && draft === null && <Feedback tone="success">Videos guardados.</Feedback>}

      {videos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay videos.</p>
      ) : (
        <ul className="grid gap-2">
          {videos.map((video, index) => (
            <li
              key={`${index}-${video.url}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3 text-sm"
            >
              <span className="min-w-0 break-all">
                <span className="font-bold text-ink">{video.titulo}</span>{' '}
                <span className="text-muted">{video.url}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar el video ${video.titulo}`}
                onClick={() => setDraft(videos.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {videos.length < MAX_VIDEOS && (
        <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={agregar} noValidate>
          <Field
            label="Título"
            name="video-titulo"
            maxLength={TITULO_MAX}
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
          />
          <Field
            label="Enlace (https://)"
            name="video-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            Agregar video
          </Button>
        </form>
      )}
      {formError && (
        <p className="field__error" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          loading={save.isPending}
          disabled={draft === null}
          onClick={() => save.mutate(videos)}
        >
          Guardar videos
        </Button>
        {draft !== null && (
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            Descartar cambios
          </Button>
        )}
      </div>
    </section>
  );
}
