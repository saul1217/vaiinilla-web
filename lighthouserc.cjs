// QA-049 · Lighthouse CI del panel. LHCI_URL = preview de Vercel del mismo commit (sin barra final).
const base = process.env.LHCI_URL ?? 'http://127.0.0.1:4173';

module.exports = {
  ci: {
    collect: {
      url: [`${base}/app/espacios`, `${base}/app/pos`],
      numberOfRuns: 3,
      puppeteerScript: './lighthouse/login.cjs',
      settings: { preset: 'desktop', onlyCategories: ['performance', 'accessibility', 'best-practices'] },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.8 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './lhci-reports' },
  },
};
