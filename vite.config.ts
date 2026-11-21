import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En Vercel Preview (develop → dev.vaiinilla.app) se habilita pago mixto en POS por defecto;
// en pruebas (Vitest) y producción no se inyecta aquí.
const previewFeatureDefines =
  process.env.VERCEL_ENV === 'preview'
    ? {
        'import.meta.env.VITE_POS_MIXED_PAYMENTS_ENABLED': JSON.stringify(
          process.env.VITE_POS_MIXED_PAYMENTS_ENABLED ?? 'true',
        ),
      }
    : undefined;

export default defineConfig({
  define: previewFeatureDefines,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
    env: {
      VITE_API_URL: 'https://vaiinillaback-development.up.railway.app/api/v1',
    },
  },
});
