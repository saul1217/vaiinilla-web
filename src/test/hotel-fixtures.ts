import type { HotelSettings, HotelSummary } from '../types/api';

/** Respuestas de ejemplo de /hotel/resumen y /hotel/configuracion (vaiinilla_back docs/hotel.md). */
export const summaryFixture = (patch: Partial<HotelSummary> = {}): HotelSummary => ({
  habitaciones: { total: 20, ocupadas: 12, por_limpiar: 3, sin_molestar: 1 },
  room_service: { pedidos_hoy: 9, ventas_hoy: '1840.00', pedidos_a_cuartos: 2, en_cocina_ahora: 1 },
  solicitudes: { abiertas: 4, mas_vieja_desde: '2026-11-09T14:10:00.000Z' },
  lo_mas_pedido: [{ producto: 'Hamburguesa', cantidad: 7 }],
  llegadas_hoy: 3,
  salidas_hoy: [],
  consultado_en: '2026-11-09T14:25:30.000Z',
  ...patch,
});

export const settingsFixture = (patch: Partial<HotelSettings> = {}): HotelSettings => ({
  activo: true,
  cargo_habitacion_activo: true,
  tarjeta_al_pedir: true,
  codigo_entrega_activo: true,
  cocina_desde: null,
  cocina_hasta: null,
  solicitudes_activas: true,
  no_molestar_activo: true,
  hora_checkout: '12:00',
  salida_tardia_hora: null,
  salida_tardia_precio: null,
  ...patch,
});
