// Grabar el enlace de una mesa o de la tienda en una etiqueta NFC. Solo Chrome en
// Android escribe NFC desde la web; en los demás el panel explica qué enlace grabar
// con cualquier app de NFC. Al acercar el teléfono, el sistema abre el enlace solo.

interface NdefWriter {
  write(message: { records: { recordType: 'url'; data: string }[] }): Promise<void>;
}

type NdefWindow = Window & { NDEFReader?: new () => NdefWriter };

export function canWriteNfc(target: Window = window): boolean {
  return typeof (target as NdefWindow).NDEFReader === 'function';
}

export async function writeNfcUrl(url: string, target: Window = window): Promise<void> {
  const Reader = (target as NdefWindow).NDEFReader;
  if (!Reader) throw new Error('Este navegador no puede grabar etiquetas NFC.');
  await new Reader().write({ records: [{ recordType: 'url', data: url }] });
}

interface NdefReadingEvent extends Event {
  serialNumber: string;
}
interface NdefScanner extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}
type NdefScanWindow = Window & { NDEFReader?: new () => NdefScanner };

/**
 * Lee el número de serie de la próxima tarjeta NFC que se acerque (Chrome en Android).
 * Se cancela con `signal`. Es el mismo número que guarda la credencial NFC del alumno.
 */
export function readNfcSerial(signal: AbortSignal, target: Window = window): Promise<string> {
  const Reader = (target as NdefScanWindow).NDEFReader;
  if (!Reader) return Promise.reject(new Error('Este navegador no puede leer tarjetas NFC.'));
  const reader = new Reader();
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Lectura cancelada', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    reader.addEventListener('reading', (event) => {
      const serial = (event as NdefReadingEvent).serialNumber?.trim();
      if (!serial) return;
      signal.removeEventListener('abort', onAbort);
      resolve(serial);
    }, { signal });
    reader.addEventListener('readingerror', () => reject(new Error('No se pudo leer la tarjeta. Acércala otra vez.')), { signal, once: true });
    reader.scan({ signal }).catch(reject);
  });
}
