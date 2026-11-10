import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Feedback, PageHeader } from '../components/ui';
import { VilloDevicesPanel } from '../components/villo-devices-panel';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { SimpleMarkdown } from '../lib/simple-markdown';
import { NotFoundPage } from './not-found-page';

type TabKey = 'guia' | 'dispositivos';

export function VilloPage() {
  const { platform } = useSessions();
  // Igual que el resto del panel de plataforma: usar el token del contexto de sesión.
  const token = platform?.token ?? null;

  const access = useQuery({
    queryKey: ['villo-owner-access', Boolean(token)],
    queryFn: async () => {
      await api.villoOwnerAccess(token);
      return true as const;
    },
    retry: false,
  });

  if (access.isError) {
    // Cualquier 404, error de red o falta de sesión: 404 estándar.
    return <NotFoundPage />;
  }

  if (access.isPending) {
    return (
      <div className="grid min-h-[50vh] place-items-center" role="status">
        <span className="inline-flex items-center gap-3 font-semibold text-ink">Validando acceso…</span>
      </div>
    );
  }

  return <VilloOwnerArea authToken={token} />;
}

function VilloOwnerArea({ authToken }: { authToken: string | null }) {
  const [tab, setTab] = useState<TabKey>('guia');
  const guide = useQuery({
    queryKey: ['villo-owner-guide', authToken ?? 'none'],
    queryFn: () => api.villoOwnerGuide(authToken),
    enabled: tab === 'guia',
    retry: false,
  });

  const updatedAt = guide.data?.actualizado_en
    ? new Date(guide.data.actualizado_en)
    : null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Sección privada"
        title="Villo"
        description="Herramientas internas del dueño de la plataforma."
      />

      <nav className="tabs" role="tablist" aria-label="Villo">
        <button
          role="tab"
          aria-selected={tab === 'guia'}
          aria-controls="villo-tabpanel-guia"
          className={`tab ${tab === 'guia' ? 'tab--active' : ''}`}
          onClick={() => setTab('guia')}
          type="button"
        >
          Guía
        </button>
        <button
          role="tab"
          aria-selected={tab === 'dispositivos'}
          aria-controls="villo-tabpanel-dispositivos"
          className={`tab ${tab === 'dispositivos' ? 'tab--active' : ''}`}
          onClick={() => setTab('dispositivos')}
          type="button"
        >
          Dispositivos
        </button>
      </nav>

      {tab === 'guia' ? (
        <section
          id="villo-tabpanel-guia"
          role="tabpanel"
          aria-labelledby="Guía"
          className="prose max-w-none villo-markdown"
        >
          {guide.isError && <Feedback tone="error">{errorMessage(guide.error)}</Feedback>}
          {guide.isPending ? (
            <div className="analytics-loading" role="status">Cargando guía…</div>
          ) : guide.data ? (
            <>
              <SimpleMarkdown source={guide.data.markdown} />
              {updatedAt && (
                <p className="mt-6 text-xs text-muted">
                  Última actualización:{' '}
                  {new Intl.DateTimeFormat('es-MX', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(updatedAt)}
                </p>
              )}
            </>
          ) : null}
        </section>
      ) : (
        <section
          id="villo-tabpanel-dispositivos"
          role="tabpanel"
          aria-labelledby="Dispositivos"
        >
          <VilloDevicesPanel />
        </section>
      )}
    </div>
  );
}

