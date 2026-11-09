/** Panel admin: oculta cashback/wallet hasta reactivarlo. No afecta al backend ni a saldos. */
export const CASHBACK_ENABLED = false;
/**
 * Inventario y recetas: apagado hasta pasar QA_SEGURIDAD. Antes de prenderlo, la migración 205
 * (`20261110020000_205_cocina_edita_inventario`) tiene que estar aplicada en el destino: sin ella,
 * GET /inventario/insumos no manda `permisos` y Cocina se queda en solo lectura.
 * Revisado el 2026-11-09: aplicada en dev (Vainilla_bd_pruebas), falta en producción.
 */
export const INVENTARIO_ENABLED = false;
export const CORTES_REPORTE_ENABLED = false;
/** Asistente IA de configuración: apagado hasta pasar QA_SEGURIDAD y resolver backend #226 y #229. */
export const IA_CONFIG_ENABLED = false;
