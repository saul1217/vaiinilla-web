/**
 * Operación diaria del personal de hotel en la consola web (Recepción con check-in, cargos y
 * check-out, y el tablero del ama de llaves; paridad con vaiinilla-android ui/hotel/staff):
 * apagado hasta que COORDINADOR_QA lo libere. Aun prendido, solo se ve en un negocio con hotel
 * (`GET /hotel/configuracion` responde `activo: true`) y con los roles que acepta el backend:
 * Recepción cajero y admin; ama de llaves mesero y admin.
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const HOTEL_STAFF_ENABLED = false;
