// T3-0006: un solo puerto para todo el E2E. playwright.config.ts levanta Vite aquí y su baseURL
// es SIEMPRE este servidor local: specs como pago-mixto-reintentos interceptan módulos de Vite
// dev y no pueden ir contra un despliegue. Ya no hay puertos fijos sueltos en los specs
// (antes la config usaba 4173 y tres specs 5173).
// - E2E_PORT cambia el puerto local (por ejemplo E2E_PORT=5173 si el CORS del API remoto solo admite ese).
// - E2E_BASE_URL lo leen solo los specs que corren contra un servidor desplegado (panel,
//   visual-legibilidad, ui-regresion); si falta, usan este mismo servidor local.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const LOCAL_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
