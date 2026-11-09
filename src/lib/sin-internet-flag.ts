/**
 * Operación sin internet (fase 1): apagada hasta que QA la libere.
 * Va en su propio módulo y no en features.ts porque las pruebas e2e reemplazan features.ts
 * con solo las banderas que usan; si el flag viviera ahí, importarlo rompería toda la app en esas pruebas.
 */
export const SIN_INTERNET_ENABLED = false;
