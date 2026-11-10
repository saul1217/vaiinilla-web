/**
 * Admin de Hotel en la consola web (resumen, habitaciones y ajustes, paridad con Android):
 * apagado hasta que COORDINADOR_QA lo libere. Aun prendido, solo se ve con rol admin y en un
 * negocio con hotel (`GET /hotel/configuracion` responde `activo: true`).
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const HOTEL_ADMIN_ENABLED = false;
