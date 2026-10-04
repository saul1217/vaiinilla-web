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
