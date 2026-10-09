// "Flujo de mi tienda": plantillas por tipo de negocio y la vista previa de cómo funciona.
// Qué existe y qué falta está en Obsidian → "Flujos por tipo de negocio" (verificado en dev
// el 30 sep 2026). No hay plantilla de hotel: decisión de David.

export type BusinessType = 'cafeteria' | 'restaurante' | 'padel' | 'bar' | 'food_truck' | 'drive_thru' | 'comedor' | 'evento';

export interface Franja {
  desde: string;
  hasta: string;
}

export interface FlowSettings {
  tipo: BusinessType;
  entrega_requiere_qr: boolean;
  permite_pago_al_final: boolean;
  /** Permite recargas y compras con saldo / wallet (por defecto true). */
  permite_saldo?: boolean;
  gracia_liberacion_min: number;
  /** Horas en las que se reciben pedidos; vacío = a cualquier hora. */
  franjas_pedido: Franja[];
}

export interface FlowTemplate {
  id: string;
  label: string;
  description: string;
  settings: FlowSettings;
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'cafeteria-escolar',
    label: 'Cafetería escolar',
    description: 'Piden con su matrícula, pagan al pedir y recogen en barra con QR.',
    settings: { tipo: 'cafeteria', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'cafeteria-mesas',
    label: 'Cafetería con mesas',
    description: 'Escanean el QR de su mesa, pagan al pedir y el mesero lo lleva.',
    settings: { tipo: 'cafeteria', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'restaurante',
    label: 'Restaurante con mesero',
    description: 'Piden en la mesa sin pagar, varias rondas, y pagan la cuenta al final.',
    settings: { tipo: 'restaurante', entrega_requiere_qr: false, permite_pago_al_final: true, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'bar',
    label: 'Bar o cantina',
    description: 'Rondas en cuenta abierta, entrega sin escanear nada y cobro al irse.',
    settings: { tipo: 'bar', entrega_requiere_qr: false, permite_pago_al_final: true, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'padel',
    label: 'Club de pádel',
    description: 'Rentan la cancha, piden durante el partido y pagan todo al irse.',
    settings: { tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'food-truck',
    label: 'Food truck o puesto',
    description: 'Piden y pagan en la app; recogen con QR.',
    settings: { tipo: 'food_truck', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'drive-thru',
    label: 'Drive-thru',
    description: 'Piden desde el auto, pagan en la app y recogen en la ventanilla con QR.',
    settings: { tipo: 'drive_thru', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'comedor',
    label: 'Comedor de empresa',
    description: 'Se identifican con su número de empleado, eligen el menú del día y pagan con saldo.',
    settings: { tipo: 'comedor', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
  {
    id: 'evento',
    label: 'Cine, estadio o evento',
    description: 'Escanean el QR de su asiento, pagan en la app y se lo llevan al asiento.',
    settings: { tipo: 'evento', entrega_requiere_qr: true, permite_pago_al_final: false, gracia_liberacion_min: 5, franjas_pedido: [] },
  },
];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  cafeteria: 'Cafetería',
  restaurante: 'Restaurante',
  padel: 'Club de pádel',
  bar: 'Bar o cantina',
  food_truck: 'Food truck o puesto',
  drive_thru: 'Drive-thru',
  comedor: 'Comedor de empresa',
  evento: 'Cine, estadio o evento',
};

export const MAX_GRACE_MINUTES = 60;

export function sameSettings(a: FlowSettings, b: FlowSettings): boolean {
  return (
    a.tipo === b.tipo &&
    a.entrega_requiere_qr === b.entrega_requiere_qr &&
    a.permite_pago_al_final === b.permite_pago_al_final &&
    (a.permite_saldo ?? true) === (b.permite_saldo ?? true) &&
    a.gracia_liberacion_min === b.gracia_liberacion_min &&
    JSON.stringify(a.franjas_pedido) === JSON.stringify(b.franjas_pedido)
  );
}

/** La plantilla cuyos ajustes coinciden con los actuales (la primera, si hay empate), o `null`. */
export function matchingTemplate(settings: FlowSettings): FlowTemplate | null {
  return FLOW_TEMPLATES.find((template) => sameSettings(template.settings, settings)) ?? null;
}

export function validGrace(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_GRACE_MINUTES;
}

export const MAX_FRANJAS = 6;
const HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const MINUTOS_DEL_DIA = 1440;

/** Llamar solo con horas ya validadas por HOUR_PATTERN; los valores por defecto solo calman al tipo. */
function minutosDelDia(hora: string): number {
  const [horas = 0, minutos = 0] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

/** Una franja que cruza la medianoche ocupa dos tramos: hasta el final del día y desde las 00:00. */
function tramosDeFranja(franja: Franja): { inicio: number; fin: number }[] {
  const inicio = minutosDelDia(franja.desde);
  const fin = minutosDelDia(franja.hasta);
  if (fin > inicio) return [{ inicio, fin }];
  return fin > 0
    ? [
        { inicio, fin: MINUTOS_DEL_DIA },
        { inicio: 0, fin },
      ]
    : [{ inicio, fin: MINUTOS_DEL_DIA }];
}

/** Mismas reglas que el backend: HH:MM, hasta distinta de desde (si es antes, cruza la medianoche), sin empalmarse, máximo 6. */
export function franjasError(franjas: Franja[]): string | null {
  if (franjas.length > MAX_FRANJAS) return `Máximo ${MAX_FRANJAS} franjas.`;
  for (const franja of franjas) {
    if (!HOUR_PATTERN.test(franja.desde) || !HOUR_PATTERN.test(franja.hasta)) return 'Escribe las dos horas de cada franja.';
    if (franja.hasta === franja.desde) return 'En cada franja, la hora final debe ser distinta de la inicial.';
  }
  const tramos = franjas.flatMap(tramosDeFranja).sort((a, b) => a.inicio - b.inicio);
  let finAnterior = 0;
  for (const tramo of tramos) {
    if (tramo.inicio < finAnterior) return 'Las franjas no pueden empalmarse.';
    finAnterior = Math.max(finAnterior, tramo.fin);
  }
  return null;
}

/** Las franjas ordenadas por hora de inicio (así las guarda el backend). */
export function sortFranjas(franjas: Franja[]): Franja[] {
  return [...franjas].sort((a, b) => a.desde.localeCompare(b.desde));
}

export type StepStatus = 'works' | 'soon';

export interface FlowStep {
  role: 'Admin' | 'Cliente' | 'Caja' | 'Cocina' | 'Mesero' | 'Sistema' | 'Barra';
  text: string;
  status: StepStatus;
}

function place(tipo: BusinessType): string {
  switch (tipo) {
    case 'padel':
      return 'de la cancha';
    case 'evento':
      return 'de su asiento';
    case 'drive_thru':
      return 'del cajón';
    default:
      return 'de su mesa';
  }
}

/** "12:00 a 15:00 y 18:00 a 20:00". */
export function describeFranjas(franjas: Franja[]): string {
  return sortFranjas(franjas)
    .map((franja) => `${franja.desde} a ${franja.hasta}`)
    .join(' y ');
}

/**
 * Los pasos de cada rol según los ajustes. `works` = ya funciona hoy en Vaiinilla; `soon` = es de
 * este tipo de negocio pero todavía no existe (se muestra como "Próximamente").
 * Qué existe y qué falta: Obsidian → "Flujos por tipo de negocio".
 */
export function buildFlow(settings: FlowSettings): FlowStep[] {
  const { tipo, entrega_requiere_qr: qr, permite_pago_al_final: payLater, franjas_pedido: franjas } = settings;
  const where = place(tipo);
  const delivery: FlowStep = {
    role: 'Mesero',
    text: qr ? 'En mesa lo entrega sin QR; para llevar valida el QR' : 'Entrega sin QR en mesa y para llevar',
    status: 'works',
  };
  const pickup: FlowStep = {
    role: 'Caja',
    text: qr ? 'En mesa entrega sin QR; para llevar valida el QR' : 'Entrega sin QR en mesa y para llevar',
    status: 'works',
  };
  const hours: FlowStep | null =
    franjas.length > 0
      ? { role: 'Sistema', text: `Recibe pedidos solo de ${describeFranjas(franjas)}`, status: 'works' }
      : null;

  const steps: FlowStep[] = [];
  if (tipo === 'evento') {
    steps.push({ role: 'Admin', text: 'Crea los asientos de golpe, cada uno con su QR', status: 'works' });
  }
  if (hours) steps.push(hours);

  if (tipo === 'comedor') {
    steps.push({ role: 'Cliente', text: 'Se identifica con su número de empleado y elige el menú del día', status: 'works' });
  } else if (tipo === 'drive_thru') {
    steps.push({ role: 'Cliente', text: 'Pide desde el auto', status: 'works' });
  } else if (tipo === 'cafeteria' || tipo === 'food_truck') {
    steps.push({ role: 'Cliente', text: tipo === 'food_truck' ? 'Pide en la app' : 'Pide con su matrícula o escaneando el QR de su mesa', status: 'works' });
  } else {
    steps.push({ role: 'Cliente', text: `Escanea el QR ${where}`, status: 'works' });
  }

  if (payLater) {
    steps.push(
      { role: 'Cliente', text: 'Pide las rondas que quiera, sin pagar todavía: todo va a la cuenta', status: 'works' },
      { role: 'Cocina', text: 'Prepara en cuanto llega el pedido, sin esperar el cobro', status: 'works' },
      delivery,
      { role: 'Cliente', text: 'Al terminar, pide la cuenta desde la app', status: 'works' },
      { role: 'Mesero', text: 'Cobra la cuenta en efectivo o con la terminal, completa o dividida por pedido', status: 'works' },
      { role: 'Mesero', text: tipo === 'padel' ? 'La cancha se libera al quedar saldada' : 'La mesa se libera al quedar saldada', status: 'works' },
      { role: 'Sistema', text: 'Avisa si alguien se fue sin pagar', status: 'works' },
      { role: 'Cliente', text: 'Paga la cuenta con su saldo desde la app', status: 'soon' },
    );
    if (tipo === 'bar') {
      steps.splice(steps.length - 7, 0, {
        role: 'Barra',
        text: 'Las bebidas de la estación Barra / Bebidas salen directo, sin pasar por cocina',
        status: 'works',
      });
    }
    return steps;
  }

  steps.push({ role: 'Cliente', text: 'Paga con saldo, tarjeta o efectivo al pedir', status: 'works' });
  if (tipo === 'drive_thru') {
    steps.push({ role: 'Cliente', text: 'Avisa que ya llegó con un botón', status: 'works' });
  }
  if (tipo === 'comedor') {
    steps.push({ role: 'Sistema', text: 'Descuenta de la nómina', status: 'soon' });
  } else {
    steps.push({ role: 'Caja', text: 'Cobra si fue efectivo', status: 'works' });
  }
  steps.push({
    role: 'Cocina',
    text: tipo === 'drive_thru' ? 'Prepara y marca listo; ve en el pedido que ya llegó' : 'Prepara y marca listo',
    status: 'works',
  });
  if (tipo === 'drive_thru') {
    steps.push({ role: 'Caja', text: 'Escanea el QR en la ventanilla y entrega', status: 'works' });
  } else if (tipo === 'evento') {
    steps.push(
      { role: 'Cocina', text: 'Prepara en el punto más cercano al asiento', status: 'soon' },
      { role: 'Mesero', text: 'Lleva el pedido al asiento', status: 'works' },
      delivery,
    );
  } else if (tipo === 'cafeteria' && !qr) {
    steps.push({ role: 'Mesero', text: 'Lleva el pedido a la mesa sin escanear nada', status: 'works' });
  } else {
    steps.push(pickup);
  }
  steps.push({ role: 'Sistema', text: 'Acredita el cashback', status: 'works' });
  return steps;
}

export function flowSummary(steps: FlowStep[]): { works: number; soon: number } {
  return {
    works: steps.filter((step) => step.status === 'works').length,
    soon: steps.filter((step) => step.status === 'soon').length,
  };
}
