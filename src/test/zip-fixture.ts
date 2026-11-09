/**
 * Un .xlsx de prueba: solo el directorio central del zip y su cierre, que es lo que revisa
 * checkZipExpansion. `size` es lo que dice ocupar cada parte ya descomprimida.
 */
export function zipFixture(entries: { name: string; size: number; compressed: number }[]): Uint8Array {
  const encoder = new TextEncoder();
  const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const headers = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const header = new Uint8Array(46 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(20, entry.compressed, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, name.length, true);
    header.set(name, 46);
    return header;
  });
  const centralSize = headers.reduce((sum, h) => sum + h.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + centralSize + end.length);
  out.set(local, 0);
  let pos = local.length;
  for (const h of headers) { out.set(h, pos); pos += h.length; }
  out.set(end, pos);
  return out;
}

/** Un Excel chico y normal. */
export function smallXlsx(): Uint8Array {
  return zipFixture([
    { name: '[Content_Types].xml', size: 1200, compressed: 400 },
    { name: 'xl/worksheets/sheet1.xml', size: 40_000, compressed: 6_000 },
  ]);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
