/**
 * Admin de Escuela en la consola web (código para unirse, reglas, cada día, padrón, tutores y
 * devoluciones; paridad con Negocio › Escuela de Android): apagado hasta que COORDINADOR_QA lo libere.
 * Aun prendido, solo se ve con rol admin y en un negocio con escuela
 * (`GET /establecimiento/configuracion` responde `modo_escuela: true`).
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const SCHOOL_ADMIN_ENABLED = false;
