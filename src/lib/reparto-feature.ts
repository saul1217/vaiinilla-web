/**
 * Reparto y encargos en la consola web (agenda, «Por aceptar», «Me deben» y las acciones de
 * aceptar, rechazar, salir, entregar con código, cobrar en la puerta y cancelar; paridad con
 * Pedidos › agenda de repostería de Android, CASA-09): apagado hasta que COORDINADOR_QA lo libere.
 * Aun prendido, solo lo ven admin y cajero, los roles que acepta el backend en esas rutas.
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const REPARTO_ENABLED = false;
