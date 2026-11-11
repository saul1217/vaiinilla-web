// T3-0006: un solo puerto para todo el E2E. playwright.config.ts levanta Vite aquí y los specs
// usan el mismo baseURL; ya no hay valores fijos sueltos (antes la config usaba 4173 y tres specs 5173).
// - E2E_PORT cambia el puerto local (por ejemplo E2E_PORT=5173 si el CORS del API remoto solo admite ese).
// - E2E_BASE_URL apunta a un servidor ya desplegado (CI de develop-e2e); entonces no se usa el local.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const LOCAL_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim() || LOCAL_BASE_URL;
