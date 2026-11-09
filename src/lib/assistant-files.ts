import type { StoreAssistantFile } from '../types/api';

/** Los mismos topes que valida el backend (src/services/asistente-archivos.js). */
export const ASSISTANT_MAX_FILES = 3;
export const ASSISTANT_MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Lo que puede ocupar el .xlsx ya descomprimido. Un .xlsx es un zip: 2 MB comprimidos pueden volverse
 * cientos de MB (bomba de descompresión). El backend debe poner su propio tope antes de cargarlo; este
 * revisa el índice del zip para no mandar siquiera un archivo así.
 */
export const ASSISTANT_MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
export const ASSISTANT_MAX_ZIP_ENTRIES = 2000;
/** Un Excel normal se comprime de 5 a 20 veces; más de 100 por parte es sospechoso. */
export const ASSISTANT_MAX_ZIP_RATIO = 100;

export class AssistantFileError extends Error {}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/**
 * Lee el directorio central del zip y suma lo que ocupa cada parte descomprimida. Lanza AssistantFileError si
 * se expande de más, si trae demasiadas partes o si el índice no se puede leer (incluido ZIP64, que un .xlsx
 * de 2 MB no necesita).
 */
export function checkZipExpansion(bytes: Uint8Array, name: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const broken = () => new AssistantFileError(`«${name}» no es un Excel (.xlsx) válido. Ábrelo en Excel, guárdalo como .xlsx y mándalo otra vez.`);
  const tooBig = () => new AssistantFileError(`«${name}» se expande demasiado al abrirlo. Manda solo las hojas que necesitas en un Excel más chico.`);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1)
    if (view.getUint32(i, true) === EOCD) { eocd = i; break; }
  if (eocd < 0) throw broken();
  const entries = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || offset === 0xffffffff) throw tooBig();
  if (entries > ASSISTANT_MAX_ZIP_ENTRIES) throw tooBig();
  let pos = offset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== CENTRAL) throw broken();
    const compressed = view.getUint32(pos + 20, true);
    const size = view.getUint32(pos + 24, true);
    if (size === 0xffffffff || compressed === 0xffffffff) throw tooBig();
    total += size;
    if (total > ASSISTANT_MAX_UNZIPPED_BYTES) throw tooBig();
    if (size > 1024 * 1024 && size > compressed * ASSISTANT_MAX_ZIP_RATIO) throw tooBig();
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
}

/** El siguiente id libre: excel1, excel2 o excel3. */
export function nextFileId(files: StoreAssistantFile[]): string {
  const used = new Set(files.map((file) => file.id));
  for (let n = 1; n <= ASSISTANT_MAX_FILES; n += 1) if (!used.has(`excel${n}`)) return `excel${n}`;
  throw new AssistantFileError(`Solo caben ${ASSISTANT_MAX_FILES} archivos de Excel por plática.`);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Lee un .xlsx elegido por el dueño. Lanza AssistantFileError con un mensaje que entiende. */
export async function readAssistantFile(file: File, current: StoreAssistantFile[]): Promise<StoreAssistantFile> {
  const id = nextFileId(current);
  if (!/\.xlsx$/i.test(file.name))
    throw new AssistantFileError('Solo se pueden mandar archivos de Excel (.xlsx). Guárdalo así y mándalo otra vez.');
  if (file.size > ASSISTANT_MAX_FILE_BYTES)
    throw new AssistantFileError('Ese Excel pesa más de 2 MB. Manda solo las hojas que necesitas.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Un .xlsx es un zip: empieza con «PK».
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new AssistantFileError(`«${file.name}» no es un Excel (.xlsx). Guárdalo como .xlsx y mándalo otra vez.`);
  checkZipExpansion(bytes, file.name);
  return { id, nombre: file.name.slice(0, 120), contenido: toBase64(bytes) };
}
