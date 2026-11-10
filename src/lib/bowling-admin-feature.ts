/**
 * Administración de boliche en la consola web (pistas con precio y capacidad, turnos del día y
 * cobro en efectivo de la renta con jugadores; paridad con Android): apagado hasta que
 * COORDINADOR_QA lo libere. Aun prendido, la página solo opera en un negocio de tipo `boliche`
 * (`GET /reservas/disponibilidad` responde `tipo_establecimiento: "boliche"`); editar pistas es
 * del rol admin y rentar y cobrar es de admin, Caja y mesero.
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const BOWLING_ADMIN_ENABLED = false;
