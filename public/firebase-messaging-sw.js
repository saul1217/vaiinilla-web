/* global firebase, importScripts, self */

// Service worker de Firebase Cloud Messaging para el panel del personal.
//
// Es lo que permite que al mesero le llegue el aviso con la pestaña cerrada o el
// teléfono bloqueado, algo que `new Notification()` no logra en la mayoría de los
// móviles (ver el comentario en src/lib/alert-sound.ts).
//
// Vive en `public/` y NO pasa por Vite: el navegador lo pide tal cual desde la raíz
// del sitio, así que no puede usar import.meta.env ni módulos ES.
//
// La configuración llega en la QUERY de su propia URL de registro, no por postMessage:
// el navegador apaga el worker cuando está inactivo y lo revive para atender el push,
// y en ese momento no hay página que le mande nada. La URL de registro sí persiste,
// así que es el único canal que sobrevive al reinicio. Si la configuración falta,
// `onBackgroundMessage` nunca se registra y Chrome muestra su aviso genérico
// ("Este sitio se actualizó en segundo plano") en lugar del nuestro.
//
// El backend manda mensajes data-only a propósito (ver notifications.service.js), así
// que el texto se arma aquí.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Mismos textos que notifications.service.js usa para iOS, para que el mesero lea lo
// mismo en cualquier dispositivo.
const TEXTO_MOTIVO = {
  atencion: 'Necesita atención',
  utensilios: 'Pide cubiertos o servilletas',
  problema: 'Algo está mal con su pedido',
  cuenta: 'Pide la cuenta',
};

/** Arma título y cuerpo desde el `data` del backend, que manda mensajes data-only. */
function textoDelAviso(d) {
  const espacio = d.espacio_nombre;
  const folio = d.folio ? `Pedido #${d.folio}` : 'Pedido';
  switch (d.alert) {
    case 'llamada_mesa':
      return {
        titulo: espacio ? `${espacio} te llama` : 'Una mesa te llama',
        cuerpo: TEXTO_MOTIVO[d.motivo] || 'Necesita atención',
      };
    case 'listo_mesero':
      return {
        titulo: `${folio} listo`,
        cuerpo: espacio ? `Llévalo a ${espacio}.` : 'Entregar al espacio del alumno.',
      };
    case 'turno_por_terminar': {
      const min = Number(d.restante_min);
      return {
        titulo: espacio ? `${espacio}: turno por terminar` : 'Turno por terminar',
        cuerpo:
          min > 0
            ? `Termina en ${min} min. Ve preparando la cuenta.`
            : 'Ya terminó. Cobra la cuenta y libera el espacio.',
      };
    }
    case 'nueva_comanda':
      return { titulo: `Nueva comanda ${folio}`, cuerpo: 'Cocina: listo para preparar.' };
    case 'por_cobrar':
      return { titulo: `${folio} por cobrar`, cuerpo: 'Entró un pedido en efectivo.' };
    default:
      return { titulo: 'Vaiinilla', cuerpo: espacio || folio };
  }
}

function configDesdeUrl() {
  const p = new URL(self.location.href).searchParams;
  const config = {
    apiKey: p.get('apiKey'),
    authDomain: p.get('authDomain'),
    projectId: p.get('projectId'),
    messagingSenderId: p.get('messagingSenderId'),
    appId: p.get('appId'),
  };
  return config.apiKey && config.projectId && config.appId && config.messagingSenderId
    ? config
    : null;
}

function iniciar(config) {
  firebase.initializeApp(config);

  firebase.messaging().onBackgroundMessage((payload) => {
    const datos = payload.data || {};
    const { titulo, cuerpo } = textoDelAviso(datos);
    // Mostrar SIEMPRE una notificación: si no, Chrome pone la suya genérica
    // ("Este sitio se actualizó en segundo plano").
    return self.registration.showNotification(titulo, {
      body: cuerpo,
      // El panel aún no es instalable (no hay manifest ni juego de iconos), así que
      // se usa la marca que ya sirve `public/brand/`. Sin `badge`: Chrome cae a su
      // propio icono, que es lo correcto mientras la notificación salga del navegador
      // y no de una app instalada.
      icon: '/brand/vaiinilla-mark.webp',
      // Un aviso por llamada o por pedido: si llega otro del mismo, se reemplaza
      // en vez de apilarse.
      tag: datos.llamada_id || datos.orderId || datos.alert || 'vaiinilla',
      renotify: true,
      data: { url: '/mesero' },
    });
  });
}

// Se arranca al evaluar el worker, no al recibir un mensaje: así `onBackgroundMessage`
// queda registrado también cuando el navegador revive el worker para un push.
const configuracion = configDesdeUrl();
if (configuracion) iniciar(configuracion);

// Al tocar el aviso: enfocar la pestaña del panel si ya está abierta, o abrirla.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if ('focus' in cliente) return cliente.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});
