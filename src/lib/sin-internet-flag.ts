/**
 * Operación sin internet (fase 1): prendida en develop el 16 nov tras probar contra Railway development
 * un pedido de Caja tomado sin conexión y cobrado en efectivo (entró con su folio local y no se duplicó).
 * Va en su propio módulo y no en features.ts porque las pruebas e2e reemplazan features.ts
 * con solo las banderas que usan; si el flag viviera ahí, importarlo rompería toda la app en esas pruebas.
 */
export const SIN_INTERNET_ENABLED = true;
