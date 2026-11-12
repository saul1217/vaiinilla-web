import { VaiinillaApiError, errorMessage } from './api-error';
import type { ManagedSpace, VilloDevice, VilloDeviceAlert } from '../types/api';

/** Mensajes para quien administra el negocio (no técnico), por código del backend (#237). */
const villoMessages: Record<string, string> = {
  DEVICE_NOT_FOUND: 'Ese VILLO ya no existe en este negocio. Actualizamos la lista.',
  SPACE_NOT_FOUND: 'Esa mesa no existe o está inactiva en este negocio. Escoge otra.',
  DEVICE_REVOKED: 'Este VILLO ya está dado de baja: ya no se puede cambiar ni darle token.',
  DEVICE_VERSION_CONFLICT:
    'Alguien más cambió este VILLO hace un momento. Actualizamos la lista: revísalo y vuelve a intentarlo.',
  SPACE_HAS_DEVICE:
    'Esa mesa ya tiene un VILLO activo. Escoge otra mesa o quítale la mesa al otro VILLO primero.',
  FORBIDDEN_ROLE: 'Solo la administración del negocio puede manejar los VILLO.',
  VILLO_DISABLED: 'Este negocio no tiene VILLO activado. Pídele a Vaiinilla que lo active.',
  DEVICE_WITHOUT_SPACE: 'Asígnale una mesa a este VILLO antes de generar su token.',
  VALIDATION_ERROR: 'Revisa los datos: el nombre es obligatorio y mide hasta 60 letras.',
  ESTABLISHMENT_SUSPENDED: 'Este negocio está suspendido: por ahora no se pueden hacer cambios.',
};

export function villoErrorMessage(error: unknown): string {
  if (error instanceof VaiinillaApiError) return villoMessages[error.code] ?? error.message;
  if (error instanceof TypeError) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }
  return errorMessage(error);
}

/** Errores que significan que la lista que se ve ya no es la del servidor. */
export function villoErrorNeedsRefresh(error: unknown): boolean {
  return (
    error instanceof VaiinillaApiError &&
    ['DEVICE_NOT_FOUND', 'DEVICE_REVOKED', 'DEVICE_VERSION_CONFLICT', 'SPACE_HAS_DEVICE'].includes(error.code)
  );
}

export type VilloStatusFilter = 'todos' | 'activo' | 'revocado';

export function filterVilloDevices(devices: VilloDevice[], filter: VilloStatusFilter): VilloDevice[] {
  return filter === 'todos' ? devices : devices.filter((device) => device.estado === filter);
}

/** Mesas activas con el id del VILLO activo que ya tienen (una mesa, un VILLO). */
export function villoSpaceOptions(spaces: ManagedSpace[], devices: VilloDevice[]) {
  const taken = new Map<number, VilloDevice>();
  devices.forEach((device) => {
    if (device.estado === 'activo' && device.espacio) taken.set(device.espacio.id, device);
  });
  return spaces
    .filter((space) => space.activo)
    .map((space) => ({ id: space.id, nombre: space.nombre, ocupadaPor: taken.get(space.id) ?? null }));
}

export function villoTokenLabel(device: VilloDevice): string {
  if (device.estado === 'revocado') return 'Sin token (dado de baja)';
  if (!device.token.emitido) return 'Sin token';
  return device.token.vigente ? 'Token vigente' : 'Token vencido';
}

const alertLabels: Record<string, string> = {
  ip_nueva: 'Se conectó desde una red distinta a la de siempre (IP nueva).',
  fuera_de_horario: 'Se usó cuando no había ninguna caja abierta.',
};

export function villoAlertLabel(alert: VilloDeviceAlert): string {
  return alertLabels[alert.tipo] ?? `Alerta: ${alert.tipo}`;
}

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export function formatVilloDate(value: string | null, empty = 'Nunca'): string {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? empty : dateFormat.format(date);
}
