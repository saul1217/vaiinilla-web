type DeliveryOrderContext = {
  destino?: string;
  sesion_espacio_id?: string | null;
  sesion_espacio_estado?: string | null;
};

/** Sesión abierta = contexto de mesa suficiente; el creador y el grupo no alteran la política. */
export function deliveryRequiresQr(order: DeliveryOrderContext, configuredValue?: boolean): boolean {
  const hasActiveSpaceSession =
    order.destino === 'en_espacio' &&
    Boolean(order.sesion_espacio_id) &&
    order.sesion_espacio_estado === 'abierta';

  return !hasActiveSpaceSession && configuredValue !== false;
}
