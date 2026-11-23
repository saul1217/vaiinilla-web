import { CASHBACK_ENABLED, IA_CONFIG_ENABLED } from './features';
import { INVENTARIO_ENABLED } from './inventory-feature';
import { SCHOOL_ADMIN_ENABLED } from './school-admin-feature';
import { SIN_INTERNET_ENABLED } from './sin-internet-flag';
import { WALLET_CAJA_ENABLED } from './wallet-caja-feature';
import type { BusinessSettings } from '../types/api';

/** Lo que decide si una pantalla muestra un ajuste. Sin ajustes cargados, solo se usan las banderas. */
export interface SettingsIndexContext {
  settings?: Pick<
    BusinessSettings,
    'tipo_bloqueado' | 'modo_escuela' | 'cobro_requiere_codigo' | 'tiene_cocina' | 'cuenta_obligatoria' | 'alerta_retraso_activa'
  > | null;
  flags?: Partial<Record<'cashback' | 'wallet' | 'inventory' | 'school' | 'offline' | 'assistant', boolean>>;
}

export interface SettingEntry {
  id: string;
  label: string;
  /** Dónde vive, para que el admin sepa a qué pantalla va. */
  where: string;
  keywords: string[];
  to: string;
  /** El ajuste solo sale si la pantalla de destino lo muestra. */
  visible?: (ctx: SettingsIndexContext) => boolean;
}

const FLAGS = {
  cashback: CASHBACK_ENABLED,
  wallet: WALLET_CAJA_ENABLED,
  inventory: INVENTARIO_ENABLED,
  school: SCHOOL_ADMIN_ENABLED,
  offline: SIN_INTERNET_ENABLED,
  assistant: IA_CONFIG_ENABLED,
};

const flag = (ctx: SettingsIndexContext, name: keyof typeof FLAGS) => ctx.flags?.[name] ?? FLAGS[name];

const FLOW = 'Flujo de mi tienda';

/** Los ajustes del admin en la web y la pantalla donde se cambian. */
export const SETTINGS_INDEX: SettingEntry[] = [
  {
    id: 'tipo',
    label: 'Tipo de negocio',
    where: `${FLOW} › Cómo funciona tu tienda`,
    keywords: ['tipo', 'plantilla', 'giro', 'cafetería', 'restaurante', 'bar'],
    to: '/app/flujo?ajuste=flow',
    // Con el tipo fijo por Vaiinilla la pantalla no deja elegir plantilla.
    visible: (ctx) => ctx.settings?.tipo_bloqueado !== true,
  },
  {
    id: 'cuando-pagan',
    label: 'Cuándo pagan (al pedir o al final)',
    where: `${FLOW} › Cómo funciona tu tienda`,
    keywords: ['pago', 'pagar', 'al final', 'cuenta abierta', 'al pedir'],
    to: '/app/flujo?ajuste=flow',
  },
  {
    id: 'saldo',
    label: 'Pagos con saldo o cartera',
    where: `${FLOW} › Cómo funciona tu tienda`,
    keywords: ['saldo', 'cartera', 'wallet', 'recarga', 'monedero'],
    to: '/app/flujo?ajuste=flow',
  },
  {
    id: 'entrega',
    label: 'Cómo se entrega (QR, código o sin validar)',
    where: `${FLOW} › Cómo funciona tu tienda`,
    keywords: ['entrega', 'entregar', 'qr', 'código', 'codigo', 'pin', 'validar', 'recoger'],
    to: '/app/flujo?ajuste=flow',
  },
  {
    id: 'horario',
    label: 'Horario para recibir pedidos',
    where: `${FLOW} › Cómo funciona tu tienda`,
    keywords: ['horario', 'hora', 'franja', 'abrir', 'cerrar', 'atención', 'atencion'],
    to: '/app/flujo?ajuste=flow',
  },
  {
    id: 'tarjeta',
    label: 'Pagos con tarjeta',
    where: FLOW,
    keywords: ['tarjeta', 'stripe', 'crédito', 'debito', 'débito'],
    to: '/app/flujo?ajuste=payments',
  },
  {
    id: 'directorio',
    label: 'Dónde te encuentran',
    where: FLOW,
    keywords: ['directorio', 'buscar', 'dirección', 'direccion', 'mapa', 'público'],
    to: '/app/flujo?ajuste=directory',
  },
  {
    id: 'imagen',
    label: 'Imagen y videos',
    where: FLOW,
    keywords: ['imagen', 'foto', 'logo', 'video'],
    to: '/app/flujo?ajuste=media',
  },
  {
    id: 'quien-prepara',
    label: 'Quién prepara (cocina, barra o sin cocina)',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['cocina', 'barra', 'sin cocina', 'preparar', 'prepara'],
    to: '/app/flujo?ajuste=operacion',
  },
  {
    id: 'pago-en-caja',
    label: 'Pago en caja o solo pago digital',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['efectivo', 'caja', 'pago en caja', 'digital', 'cobro'],
    to: '/app/flujo?ajuste=operacion',
  },
  {
    id: 'codigo-al-cobrar',
    label: 'Pedir el código del cliente al cobrar',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['cobrar', 'cobro', 'código', 'codigo', 'pin', 'qr', 'efectivo'],
    to: '/app/flujo?ajuste=operacion',
    // La casilla solo sale con un back que ya tiene la migración 225.
    visible: (ctx) => ctx.settings?.cobro_requiere_codigo !== undefined,
  },
  {
    id: 'cuenta-obligatoria',
    label: 'Pedir con cuenta (quitar «pedir sin cuenta»)',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['cuenta', 'invitado', 'sin cuenta', 'registro', 'escuela', 'alumno'],
    to: '/app/flujo?ajuste=operacion',
    // La casilla solo sale con un back que ya tiene la migración 228.
    visible: (ctx) => ctx.settings?.cuenta_obligatoria != null,
  },
  {
    id: 'aviso-retraso',
    label: 'Avisar de pedidos pagados que tardan',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['retraso', 'tarde', 'demora', 'alerta', 'aviso', 'minutos', 'entregar'],
    to: '/app/flujo?ajuste=operacion',
    visible: (ctx) => ctx.settings?.alerta_retraso_activa != null,
  },
  {
    id: 'fondo-y-corte',
    label: 'Fondo de caja e inicio del día para el corte',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['fondo', 'corte', 'cierre', 'inicio del día', 'madrugada'],
    to: '/app/flujo?ajuste=operacion',
  },
  {
    id: 'modo-escuela',
    label: 'Modo escuela',
    where: `${FLOW} › Operación de Caja`,
    keywords: ['escuela', 'alumnos', 'tutores', 'padres'],
    to: '/app/flujo?ajuste=operacion',
  },
  {
    id: 'encargos',
    label: 'Encargos con fecha y reparto a domicilio',
    where: FLOW,
    keywords: ['encargo', 'apartar', 'mañana', 'domicilio', 'reparto', 'envío', 'aceptar', 'minutos'],
    to: '/app/flujo?ajuste=encargos',
  },
  {
    id: 'filas',
    label: 'Filas para recoger',
    where: FLOW,
    keywords: ['fila', 'filas', 'express', 'turno', 'recoger'],
    to: '/app/flujo?ajuste=filas',
  },
  {
    id: 'equipo',
    label: 'Personal e invitaciones',
    where: 'Personal e invitaciones',
    keywords: ['personal', 'equipo', 'invitar', 'cajero', 'mesero', 'rol', 'empleado'],
    to: '/app/invitaciones',
  },
  {
    id: 'espacios',
    label: 'Mesas, canchas y espacios',
    where: 'Mesas y espacios',
    keywords: ['mesa', 'cancha', 'espacio', 'qr de mesa', 'precio por hora'],
    to: '/app/espacios',
  },
  {
    id: 'menu',
    label: 'Menú, productos y precios',
    where: 'Menú',
    keywords: ['menú', 'menu', 'producto', 'precio', 'categoría', 'agotado'],
    to: '/app/menu',
  },
  {
    id: 'escuela',
    label: 'Ajustes de la escuela',
    where: 'Escuela',
    keywords: ['escuela', 'padrón', 'padron', 'alumnos', 'código de unión', 'tutores'],
    to: '/app/escuela',
    visible: (ctx) => flag(ctx, 'school') && ctx.settings?.modo_escuela === true,
  },
  {
    id: 'cashback',
    label: 'Cashback',
    where: 'Cashback y wallet',
    keywords: ['cashback', 'recompensa', 'puntos', 'regreso'],
    to: '/app/cashback',
    visible: (ctx) => flag(ctx, 'cashback'),
  },
  {
    id: 'saldo-clientes',
    label: 'Saldo de clientes',
    where: 'Saldo de clientes',
    keywords: ['saldo', 'clientes', 'recarga', 'cartera'],
    to: '/app/saldo',
    visible: (ctx) => flag(ctx, 'wallet'),
  },
  {
    id: 'inventario',
    label: 'Inventario',
    where: 'Inventario',
    keywords: ['inventario', 'insumo', 'existencia', 'stock'],
    to: '/app/inventario',
    visible: (ctx) => flag(ctx, 'inventory'),
  },
  {
    id: 'sin-internet',
    label: 'Sin internet',
    where: 'Sin internet',
    keywords: ['internet', 'sin conexión', 'offline', 'red'],
    to: '/app/sin-internet',
    visible: (ctx) => flag(ctx, 'offline'),
  },
  {
    id: 'asistente',
    label: 'Asistente de IA',
    where: 'Asistente',
    keywords: ['asistente', 'ia', 'inteligencia'],
    to: '/app/asistente-configuracion',
    visible: (ctx) => flag(ctx, 'assistant'),
  },
];

/** Sin acentos ni mayúsculas, para que «codigo» encuentre «Código». */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Los ajustes que coinciden con lo escrito y que la pantalla de destino muestra. */
export function searchSettings(query: string, ctx: SettingsIndexContext = {}, index = SETTINGS_INDEX): SettingEntry[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return index.filter((entry) => {
    if (entry.visible && !entry.visible(ctx)) return false;
    const haystack = normalizeSearch([entry.label, entry.where, ...entry.keywords].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}
