// Cuentas sintéticas del emulador local de Firebase Auth. Solo existen dentro del emulador
// que levanta el harness y desaparecen con él: no son credenciales de ningún ambiente real.
export const PROYECTO_FIREBASE = 'demo-vaiinilla-e2e';
export const PASSWORD_E2E = 'e2e-local-solo-emulador';

export const CUENTAS = {
  admin_a: { uid: 'e2e-admin-norte', email: 'admin.norte@e2e.vaiinilla.test', nombre: 'DEV Admin Norte' },
  cajero_a: { uid: 'e2e-cajero-norte', email: 'cajero.norte@e2e.vaiinilla.test', nombre: 'DEV Cajero Norte' },
  mesero_a: { uid: 'e2e-mesero-norte', email: 'mesero.norte@e2e.vaiinilla.test', nombre: 'DEV Mesero Norte' },
  cocina_a: { uid: 'e2e-cocina-norte', email: 'cocina.norte@e2e.vaiinilla.test', nombre: 'DEV Cocina Norte' },
  admin_b: { uid: 'e2e-admin-sur', email: 'admin.sur@e2e.vaiinilla.test', nombre: 'DEV Admin Sur' },
};
