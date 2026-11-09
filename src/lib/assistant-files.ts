import type { StoreAssistantFile } from '../types/api';

/** Los mismos topes que valida el backend (src/services/asistente-archivos.js). */
export const ASSISTANT_MAX_FILES = 3;
export const ASSISTANT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export class AssistantFileError extends Error {}

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
  return { id, nombre: file.name.slice(0, 120), contenido: toBase64(bytes) };
}
