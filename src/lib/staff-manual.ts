// El manual «Paso a paso» del personal (espejo de `domain/staff-manual.ts` de Expo): procedimientos
// de Caja, Cocina y Mesero que se leen aunque no haya una operación activa. Los textos nombran
// los botones de esta web, no los de la app.
export type ManualRole = 'Caja' | 'Cocina' | 'Mesero';

export interface ManualStep {
  title: string;
  body: string;
}

export interface ManualGuide {
  id: string;
  title: string;
  section: string;
  steps: ManualStep[];
  completion: string;
}

const step = (title: string, body: string): ManualStep => ({ title, body });

const changeAccess = (id: string): ManualGuide => ({
  id,
  title: '¿Cómo regreso a mis otros accesos?',
  section: 'Cuenta y acceso',
  steps: [
    step('Toca Cambiar acceso', 'Está en el menú de la izquierda en computadora, o en «Más» desde el teléfono.'),
    step('Elige otro acceso', 'Solo aparecen los negocios y modos que te asignaron.'),
  ],
  completion: 'Cambio de acceso revisado',
});

const CASHIER: ManualGuide[] = [
  {
    id: 'abrir-caja',
    title: '¿Cómo abro la caja para empezar el turno?',
    section: 'Turno',
    steps: [
      step('Busca el aviso Caja cerrada', 'Arriba de Caja dice si la caja está abierta o cerrada. Sin la caja abierta no empieces el turno.'),
      step('Toca Abrir Caja', 'Cuenta el fondo inicial, escríbelo en Monto inicial y confirma con Abrir Caja.'),
      step('Espera la confirmación', 'Cuando abre, el aviso dice Caja abierta con la hora y el fondo; ya puedes cobrar y entregar.'),
    ],
    completion: 'Caja abierta para el turno',
  },
  {
    id: 'cerrar-caja',
    title: '¿Cómo cierro la caja al terminar el turno?',
    section: 'Turno',
    steps: [
      step('Cobra o cierra las cuentas abiertas', 'Revisa que no queden mesas por cobrar. Los pedidos en efectivo que sigan por cobrar se cancelan al cerrar.'),
      step('Toca Cerrar caja', 'Está junto al aviso de Caja abierta.'),
      step('Cuenta el efectivo y confirma', 'Escribe lo que hay en el cajón en Monto final, revisa el resumen y confirma. La caja queda cerrada hasta el siguiente turno.'),
    ],
    completion: 'Caja cerrada',
  },
  {
    id: 'movimientos-cajon',
    title: '¿Cómo meto o saco dinero del cajón?',
    section: 'Turno',
    steps: [
      step('Toca Movimientos del cajón', 'Solo aparece con la caja abierta.'),
      step('Elige Meter dinero o Sacar dinero', 'Escribe el monto y el motivo, por ejemplo «cambio» o «pago al proveedor».'),
      step('Confirma', 'El movimiento entra al corte del turno con su motivo.'),
    ],
    completion: 'Movimiento del cajón revisado',
  },
  {
    id: 'corte',
    title: '¿Dónde veo el corte del día o de mi turno?',
    section: 'Turno',
    steps: [
      step('Toca Corte de caja', 'Está en Caja, junto a Cerrar caja.'),
      step('Elige el día o el turno', 'Ves lo cobrado por forma de pago, propinas y movimientos del cajón.'),
    ],
    completion: 'Corte revisado',
  },
  {
    id: 'estados-pedido',
    title: '¿Qué significan Por cobrar, Preparando, Listo y Entregado?',
    section: 'Pedidos y entrega',
    steps: [
      step('Por cobrar espera el pago', 'Cóbralo con Cobrar antes de que pase a Cocina, salvo que vaya a la cuenta de una mesa.'),
      step('Preparando todavía no se entrega', 'Cocina está trabajando en él. No intentes entregarlo.'),
      step('Listo ya puede recogerse', 'Es el momento de pedirle al cliente el QR de su pedido.'),
      step('Entregado cierra el pedido', 'Al validar el QR, el pedido queda Entregado y ya no necesita nada más.'),
    ],
    completion: 'Estados de Caja revisados',
  },
  {
    id: 'entregar-qr',
    title: '¿Cómo entrego un pedido con el QR del cliente?',
    section: 'Pedidos y entrega',
    steps: [
      step('Confirma que el pedido diga Listo', 'La entrega solo corresponde cuando Cocina ya terminó.'),
      step('Toca Entregar', 'Se abre Entregar pedido con el campo Token QR de entrega.'),
      step('Toca Escanear con cámara', 'Pide al cliente su QR y mantenlo dentro del recuadro hasta que se lea.'),
      step('Confirma la entrega', 'Solo el QR de ese pedido lo cambia a Entregado.'),
    ],
    completion: 'Pedido entregado con QR',
  },
  {
    id: 'qr-no-lee',
    title: '¿Qué hago si el QR no se puede leer o es inválido?',
    section: 'Pedidos y entrega',
    steps: [
      step('Vuelve a encuadrar el código', 'Que se vea completo, sin reflejos; acerca o aleja la pantalla del cliente.'),
      step('Si sigue sin leer, escríbelo', 'Escribe en Token QR de entrega el código que sale bajo el QR del cliente.'),
      step('Si dice inválido, pide su pedido actual', 'Que el cliente vuelva a la pantalla de su pedido y muestre el QR vigente. No entregues sin validarlo.'),
    ],
    completion: 'Recuperación de QR revisada',
  },
  {
    id: 'devoluciones',
    title: '¿Cómo confirmo una devolución?',
    section: 'Pedidos y entrega',
    steps: [
      step('Busca el aviso Devolver $…', 'Aparece en Caja cuando se quitó algo ya pagado, se canceló un pedido o se abonó de más.'),
      step('Devuélvelo por donde entró', 'Toca Devuelto en terminal o Devuelto en efectivo. Con la caja cerrada no se devuelve efectivo, salvo lo cobrado en la puerta.'),
      step('Si fue de otra forma, toca Otro', 'Escribe cómo se devolvió, por ejemplo «transferencia», y confirma.'),
    ],
    completion: 'Devoluciones revisadas',
  },
  {
    id: 'alumno-sin-telefono',
    title: '¿Cómo le vendo a un alumno sin teléfono?',
    section: 'Escuela',
    steps: [
      step('Toca Alumnos', 'Aparece en Caja cuando el negocio es una escuela.'),
      step('Búscalo', 'Por nombre o matrícula, con su credencial (cámara o escrita) o acercando su tarjeta NFC.'),
      step('Revisa alergias y lo que puede gastar hoy', 'Lo que su tutor no autorizó o tiene un alérgeno no se puede agregar.'),
      step('Cobra de su saldo', 'Si su tutor le puso PIN, pídeselo. El pedido se va a Cocina.'),
    ],
    completion: 'Venta al alumno revisada',
  },
  changeAccess('cambiar-acceso'),
];

const KITCHEN: ManualGuide[] = [
  {
    id: 'leer-comanda',
    title: '¿Cómo leo una comanda de Cocina?',
    section: 'Comandas',
    steps: [
      step('Empieza por folio y destino', 'El número identifica la comanda; debajo dice si es para llevar o para una mesa.'),
      step('Revisa cantidades y productos', 'Cada línea dice cuántas unidades preparar y las opciones que eligió el cliente.'),
      step('Mira en qué columna está', 'Pendientes espera inicio, En preparación ya está en trabajo y Listos ya terminó.'),
    ],
    completion: 'Lectura de comanda revisada',
  },
  {
    id: 'avanzar-comanda',
    title: '¿Cómo empiezo a preparar una comanda?',
    section: 'Preparación',
    steps: [
      step('Confirma que esté en Pendientes', 'Antes de empezar, revisa folio, productos y opciones.'),
      step('Toca Comenzar preparación', 'Hazlo cuando de verdad empieces. Con Poner todo en preparación empiezas todas las pendientes.'),
      step('Comprueba que pase a En preparación', 'El resto del equipo ve el cambio.'),
    ],
    completion: 'Comanda en preparación',
  },
  {
    id: 'terminar-comanda',
    title: '¿Cómo marco una comanda como lista?',
    section: 'Preparación',
    steps: [
      step('Asegúrate de que todo esté terminado', 'No la marques lista hasta que todos los productos estén preparados.'),
      step('Toca Marcar como listo', 'Tienes 10 segundos para tocar Deshacer si te equivocaste; después pasa a Listos.'),
      step('Comprueba que aparezca en Listos', 'Caja y Mesero ven el pedido listo y pueden entregarlo.'),
    ],
    completion: 'Comanda lista para entrega',
  },
  {
    id: 'no-se-puede',
    title: '¿Qué hago si no puedo preparar un artículo?',
    section: 'Preparación',
    steps: [
      step('Toca No se puede preparar', 'Elige el artículo y escribe el motivo, por ejemplo «se acabó el pan».'),
      step('Márcalo como agotado', 'En ¿Qué se acabó? apágalo para que ya no se pueda pedir. Enciéndelo cuando regrese.'),
    ],
    completion: 'Artículo rechazado revisado',
  },
  {
    id: 'para-manana',
    title: '¿Dónde veo lo apartado para mañana?',
    section: 'Escuela',
    steps: [
      step('Toca Para mañana', 'Aparece en Cocina cuando el negocio es una escuela.'),
      step('Elige el día', 'Ves cuántos pedidos hay apartados y qué productos preparar.'),
    ],
    completion: 'Apartados revisados',
  },
  changeAccess('cambiar-acceso-cocina'),
];

const WAITER: ManualGuide[] = [
  {
    id: 'atender-llamada',
    title: '¿Cómo atiendo una llamada de mesa?',
    section: 'Mesas',
    steps: [
      step('Las llamadas van primero', 'El tablero ordena las mesas por urgencia: Llamando, Pedido listo, con pedidos y libre.'),
      step('Toca la mesa y Voy', 'Le avisa a la mesa que su mesero ya va.'),
      step('Cierra la llamada con Atendida', 'La mesa deja de decir Llamando para todo el equipo. Si ya lo resolviste, puedes tocar Atendida sin pasar por Voy.'),
    ],
    completion: 'Llamadas de mesa revisadas',
  },
  {
    id: 'abrir-cuenta',
    title: '¿Cómo abro la cuenta de una mesa?',
    section: 'Mesas',
    steps: [
      step('Toca la mesa libre', 'Se abre su detalle.'),
      step('Toca Abrir cuenta', 'Hazlo cuando lleguen. Los pedidos de la mesa se van sumando a su cuenta.'),
      step('Libérala al terminar', 'Cuando esté cobrada y entregada, toca Liberar espacio.'),
    ],
    completion: 'Cuenta de mesa revisada',
  },
  {
    id: 'cobrar-cuenta',
    title: '¿Cómo cobro la cuenta de una mesa?',
    section: 'Cuentas',
    steps: [
      step('Toca Cobrar cuenta', 'En el detalle de la mesa, con su cuenta a la vista.'),
      step('Elige cómo dividir', 'Por pedidos (todo marcado de inicio), Por monto o Partes iguales.'),
      step('Forma de pago y propina', 'Efectivo o Terminal, y la propina si la dejan. Con efectivo escribe lo recibido para ver el cambio.'),
    ],
    completion: 'Cobro de cuenta revisado',
  },
  {
    id: 'entregar-mesa',
    title: '¿Cómo entrego un pedido en la mesa?',
    section: 'Entregas',
    steps: [
      step('Busca la mesa con Pedido listo', 'Cuando Cocina termina, la mesa sube en el tablero. Tócala para ver sus pedidos.'),
      step('Toca Entregar', 'Si la tienda pide QR, escanéalo con Escanear con cámara o escribe el código que sale bajo el QR.'),
    ],
    completion: 'Entrega en mesa revisada',
  },
  {
    id: 'turno-cancha',
    title: '¿Cómo abro o alargo el turno de una cancha?',
    section: 'Canchas',
    steps: [
      step('Cancha con precio: se renta', 'Elige la duración, cobra en efectivo y queda rentada.'),
      step('Cancha sin precio: abre un turno', 'Elige 60, 90 o 120 min. Para alargar toca +15, +30 o +60 min.'),
      step('Libera al terminar', 'Toca Liberar espacio dos veces: el tiempo que quedaba se pierde.'),
    ],
    completion: 'Turnos de cancha revisados',
  },
  changeAccess('cambiar-acceso-mesero'),
];

export function manualGuides(role: ManualRole): ManualGuide[] {
  if (role === 'Caja') return CASHIER;
  if (role === 'Cocina') return KITCHEN;
  return WAITER;
}

export function manualRoleFor(rol: string | undefined): ManualRole {
  if (rol === 'cocina') return 'Cocina';
  if (rol === 'mesero') return 'Mesero';
  return 'Caja';
}

export function manualSections(guides: ManualGuide[]): string[] {
  return [...new Set(guides.map((guide) => guide.section))];
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Sin acentos ni mayúsculas, cada palabra en el título, la sección o los pasos («cerrar» encuentra el cierre de caja). */
export function manualMatches(guide: ManualGuide, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold([guide.title, guide.section, guide.completion, ...guide.steps.flatMap((s) => [s.title, s.body])].join(' '));
  return words.every((word) => haystack.includes(word));
}
