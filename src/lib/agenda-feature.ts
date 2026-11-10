/**
 * Agenda de reservas del negocio en la consola web (ver por día, crear, mover y cancelar; paridad
 * con Mesas y espacios › Reservas y la renta de mostrador de Android): apagada hasta que
 * COORDINADOR_QA la libere. Aun prendida, solo la ven Administración, Caja y Mesero, que son los
 * roles a los que el back deja crear y cancelar reservas (`src/routes/reservas.routes.js`).
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const AGENDA_ENABLED = false;
