import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installPreloadErrorReload } from './app/preload-error';
import { AppRouter } from './app/router';
import { AuthProvider } from './context/auth-context';
import { SessionProvider } from './context/session-context';
import { clearLegacyStaffUi } from './lib/staff-ui';
import './styles/index.css';
import './styles/app-primitives.css';
import './styles/admin-screens.css';

clearLegacyStaffUi();
installPreloadErrorReload();

// Sentry solo se descarga si hay DSN configurado.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  void import('./app/sentry').then((m) => m.initSentry(sentryDsn)).catch(() => undefined);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (failureCount, error) => {
        if (error instanceof Error && 'status' in error && Number(error.status) < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>
          <AppRouter />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
