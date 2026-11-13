/**
 * Inventario y recetas: apagado hasta pasar QA_SEGURIDAD. Antes de prenderlo, la migración 205
 * (`20261110020000_205_cocina_edita_inventario`) tiene que estar aplicada en el destino: sin ella,
 * GET /inventario/insumos no manda `permisos` y Cocina se queda en solo lectura.
 * Vive en su propio módulo y no en features.ts: las pruebas e2e sustituyen features.ts con
 * solo las banderas que conocen, y un export que falte ahí tumba toda la app.
 * Revisado el 2026-11-09: aplicada en dev (Vainilla_bd_pruebas), falta en producción.
 */
export const INVENTARIO_ENABLED = true;
