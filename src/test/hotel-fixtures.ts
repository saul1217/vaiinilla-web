import type { HotelRequest, HotelRoom, HotelSettings, HotelStay, HotelSummary } from '../types/api';

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

/** Una estancia como la manda GET /estancias (plana, sin cargos ni pedidos) o, con `patch`, el detalle. */
export const stayFixture = (patch: Partial<HotelStay> = {}): HotelStay => ({
  id: 'stay-1',
  estado: 'en_casa',
  huesped: 'Laura Ramos',
  contacto: null,
  codigo: '482915',
  espacio_id: 304,
  espacio_nombre: 'Habitación 304',
  piso: 3,
  categoria: 'doble',
  entrada: '2026-11-09',
  salida: '2026-11-12',
  noches: 3,
  salida_prevista: '2026-11-12T18:00:00.000Z',
  tarifa_noche: '1650.00',
  no_molestar: false,
  total: '4950.00',
  cuenta: { noches_total: '4950.00', cargos_total: '0.00', pedidos_total: '0.00', total: '4950.00', pedidos_pendientes: 0 },
  metodo_cobro: null,
  total_cobrado: null,
  cargos: [],
  pedidos: [],
  version: 2,
  ...patch,
});

export const roomFixture = (patch: Partial<HotelRoom> = {}): HotelRoom => ({
  id: 101,
  nombre: 'Habitación 101',
  piso: 1,
  categoria: null,
  limpieza: 'lista',
  ocupada: false,
  no_molestar: false,
  estancia: null,
  solicitudes_abiertas: 0,
  pedidos_en_curso: 0,
  ...patch,
});

export const requestFixture = (patch: Partial<HotelRequest> = {}): HotelRequest => ({
  id: 'req-1',
  estancia_id: 'stay-1',
  habitacion: { id: 304, nombre: 'Habitación 304', piso: 3 },
  tipo: 'toallas',
  cantidad: 2,
  nota: null,
  estado: 'pendiente',
  huesped: { nombre: 'Laura' },
  tomada_por: null,
  creado_en: '2026-11-12T15:00:00.000Z',
  tomada_en: null,
  cerrada_en: null,
  version: 1,
  ...patch,
});
