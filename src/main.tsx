import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/router';
import { AuthProvider } from './context/auth-context';
import { SessionProvider } from './context/session-context';
import './styles/index.css';

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
