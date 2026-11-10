import type { BusinessSettings, SchoolGuardianRequest, SchoolGuardianship, SchoolMenuDays, SchoolStudentRequest } from '../types/api';

/** Respuestas de ejemplo de las rutas de Escuela (vaiinilla_back docs/padres-hijos.md). */
export const schoolSettingsFixture = (patch: Partial<BusinessSettings> = {}): BusinessSettings => ({
  tipo: 'cafeteria',
  entrega_requiere_qr: false,
  permite_pago_al_final: false,
  asistente_modo: 'ambos',
  gracia_liberacion_min: 0,
  tipos_disponibles: ['cafeteria'],
  modo_escuela: true,
  codigo_union: 'K7Q2XM',
  union_requiere_codigo: false,
  tutores_requieren_aprobacion: true,
  recarga_minima: '50.00',
  recarga_maxima: '2000.00',
  dias_adelanto_pedido: 3,
  hora_corte_pedido: '09:00',
  hora_corte_cancelacion: null,
  ...patch,
});

export const menuFixture = (patch: Partial<SchoolMenuDays> = {}): SchoolMenuDays => ({
  programacion: { hoy: '2026-11-10', dias_adelanto_pedido: 3 },
  dias: [{ fecha: '2026-11-11', producto_ids: [2] }],
  sin_servicio: [{ fecha: '2026-11-12', motivo: 'Junta de consejo técnico' }],
  ...patch,
});

export const guardianRequestFixture = (patch: Partial<SchoolGuardianRequest> = {}): SchoolGuardianRequest => ({
  tutela_id: '11111111-1111-4111-8111-111111111111',
  tutor: { nombre: 'Laura Pérez', email: 'laura@example.com' },
  alumno: { usuario_id: 'u-ana', nombre: 'Ana Pérez', matricula: 'A-001', grupo: '3°B', tiene_cuenta: false },
  en_padron: false,
  otros_tutores: 0,
  ...patch,
});

export const guardianshipFixture = (patch: Partial<SchoolGuardianship> = {}): SchoolGuardianship => ({
  tutela_id: '22222222-2222-4222-8222-222222222222',
  principal: true,
  tutor: { nombre: 'Laura Pérez', email: 'laura@example.com' },
  alumno: { usuario_id: 'u-ana', nombre: 'Ana Pérez', matricula: 'A-001', grupo: '3°B' },
  ...patch,
});

export const studentRequestFixture = (patch: Partial<SchoolStudentRequest> = {}): SchoolStudentRequest => ({
  id: '33333333-3333-4333-8333-333333333333',
  tipo: 'devolucion',
  como_devolver: 'efectivo',
  nota: null,
  saldo_al_pedir: '150.00',
  saldo_actual: '150.00',
  tutor: { nombre: 'Laura Pérez', email: 'laura@example.com' },
  alumno: { usuario_id: 'u-ana', nombre: 'Ana Pérez', matricula: 'A-001', grupo: '3°B' },
  ...patch,
});
