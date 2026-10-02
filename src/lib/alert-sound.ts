// Un tono corto de dos notas y una vibración. El navegador solo deja sonar tras un toque
// en la página; antes de eso el tono se omite en silencio y queda la franja y la notificación.
let ctx: AudioContext | null = null;

export function unlockAlertSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function playAlert() {
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    // Sin vibración.
  }
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = freq;
    const t = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  });
}

/** Notificación del sistema, solo con permiso ya dado y con la pestaña oculta. */
export function systemNotify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, tag: title });
  } catch {
    // Algunos móviles solo notifican desde el service worker; queda la franja.
  }
}
