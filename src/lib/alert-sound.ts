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

// Arpegio ascendente repetido dos veces: en un local ruidoso, lo que hace que un
// aviso se note no es solo el volumen, sino que insista y cambie de tono.
const NOTAS = [880, 1320, 1760];
const PASO_S = 0.13;
const LARGO_S = 0.12;
const REPETICIONES = 2;
const PAUSA_ENTRE_REPETICIONES_S = 0.18;

/**
 * Un golpe del arpegio. Suma una onda cuadrada (corta mejor el ruido ambiente) y una
 * senoidal al doble de frecuencia, que le da cuerpo sin volverlo estridente.
 */
function golpe(audio: AudioContext, salida: GainNode, freq: number, t: number) {
  ([
    ['square', freq, 0.5],
    ['sine', freq * 2, 0.18],
  ] as const).forEach(([tipo, frecuencia, pico]) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(pico, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + LARGO_S);
    osc.connect(gain).connect(salida);
    osc.start(t);
    osc.stop(t + LARGO_S + 0.01);
  });
}

export function playAlert() {
  try {
    // Patrón largo: se siente en el bolsillo aunque el local esté ruidoso.
    navigator.vibrate?.([300, 120, 300, 120, 400]);
  } catch {
    // Sin vibración.
  }
  if (!ctx || ctx.state !== 'running') return;
  const audio = ctx;
  const start = audio.currentTime;

  // Un compresor a la salida deja subir el volumen sin que los picos saturen.
  const compresor = audio.createDynamicsCompressor();
  compresor.threshold.value = -18;
  compresor.ratio.value = 12;
  const maestro = audio.createGain();
  maestro.gain.value = 0.9;
  maestro.connect(compresor).connect(audio.destination);

  const porRepeticion = NOTAS.length * PASO_S + PAUSA_ENTRE_REPETICIONES_S;
  for (let r = 0; r < REPETICIONES; r++) {
    NOTAS.forEach((freq, i) => golpe(audio, maestro, freq, start + r * porRepeticion + i * PASO_S));
  }
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
