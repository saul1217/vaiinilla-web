/**
 * Saldo y recarga en efectivo desde Caja (paridad con Android, WalletReloadSheet): apagado hasta
 * que COORDINADOR_QA lo libere. Aun prendido, recarga solo el rol cajero; admin solo consulta.
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 */
export const WALLET_CAJA_ENABLED = false;
