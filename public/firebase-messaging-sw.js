/* global firebase, importScripts, self */

// Service worker de Firebase Cloud Messaging para el panel del personal.
//
// Es lo que permite que al mesero le llegue el aviso con la pestaña cerrada o el
// teléfono bloqueado, algo que `new Notification()` no logra en la mayoría de los
// móviles (ver el comentario en src/lib/alert-sound.ts).
//
// Vive en `public/` y NO pasa por Vite: el navegador lo pide tal cual desde la raíz
// del sitio, así que no puede usar import.meta.env ni módulos ES. Por eso la
// configuración llega desde la página con postMessage en lugar de estar compilada.
//
// El backend manda mensajes data-only a propósito (ver notifications.service.js), así
// que el texto se arma aquí.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const TITULO_POR_ALERTA = {
  llamada_mesa: 'Una mesa te llama',
  listo_mesero: 'Pedido listo para llevar',
  turno_por_terminar: 'Turno por terminar',
  nueva_comanda: 'Nueva comanda',
  por_cobrar: 'Pedido por cobrar',
};

let iniciado = false;

function iniciar(config) {
  if (iniciado) return;
  firebase.initializeApp(config);
  iniciado = true;

  firebase.messaging().onBackgroundMessage((payload) => {
    const datos = payload.data || {};
    const titulo =
      datos.espacio_nombre && datos.alert === 'llamada_mesa'
        ? `${datos.espacio_nombre} te llama`
        : TITULO_POR_ALERTA[datos.alert] || 'Vaiinilla';
    const cuerpo = datos.folio ? `Pedido #${datos.folio}` : datos.motivo || '';
    self.registration.showNotification(titulo, {
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

// La página manda la configuración en cuanto registra el worker.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') iniciar(event.data.config);
});

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
