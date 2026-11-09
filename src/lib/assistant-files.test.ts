import { describe, expect, it } from 'vitest';
import { ASSISTANT_MAX_ZIP_ENTRIES, AssistantFileError, checkZipExpansion, readAssistantFile } from './assistant-files';
import { smallXlsx, toBase64, zipFixture } from '../test/zip-fixture';

const MB = 1024 * 1024;

function file(bytes: Uint8Array, name = 'Inventario.xlsx'): File {
  return new File([bytes as BlobPart], name);
}

describe('checkZipExpansion', () => {
  it('acepta un Excel normal', () => {
    expect(() => checkZipExpansion(smallXlsx(), 'Inventario.xlsx')).not.toThrow();
  });

  it('rechaza un xlsx que se expande a más de 20 MB', () => {
    const bomb = zipFixture([{ name: 'xl/worksheets/sheet1.xml', size: 25 * MB, compressed: 1.5 * MB }]);
    expect(() => checkZipExpansion(bomb, 'Bomba.xlsx')).toThrow(/se expande demasiado/);
  });

  it('rechaza la suma de muchas partes aunque cada una sea chica', () => {
    const parts = Array.from({ length: 30 }, (_, i) => ({ name: `xl/worksheets/sheet${i}.xml`, size: 0.9 * MB, compressed: 0.1 * MB }));
    expect(() => checkZipExpansion(zipFixture(parts), 'Hojas.xlsx')).toThrow(AssistantFileError);
  });

  it('rechaza una parte con proporción de compresión sospechosa', () => {
    const bomb = zipFixture([{ name: 'xl/sharedStrings.xml', size: 10 * MB, compressed: 20_000 }]);
    expect(() => checkZipExpansion(bomb, 'Raro.xlsx')).toThrow(/se expande demasiado/);
  });

  it('rechaza un zip con demasiadas partes', () => {
    const parts = Array.from({ length: ASSISTANT_MAX_ZIP_ENTRIES + 1 }, (_, i) => ({ name: `p${i}`, size: 10, compressed: 10 }));
    expect(() => checkZipExpansion(zipFixture(parts), 'Partes.xlsx')).toThrow(/se expande demasiado/);
  });

  it('rechaza ZIP64 (tamaños 0xFFFFFFFF), que un .xlsx de 2 MB no necesita', () => {
    const zip64 = zipFixture([{ name: 'xl/worksheets/sheet1.xml', size: 0xffffffff, compressed: 0xffffffff }]);
    expect(() => checkZipExpansion(zip64, 'Grande.xlsx')).toThrow(/se expande demasiado/);
  });

  it('rechaza un archivo que empieza con PK pero no trae índice de zip', () => {
    expect(() => checkZipExpansion(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'Roto.xlsx')).toThrow(/no es un Excel/);
  });
});

describe('readAssistantFile', () => {
  it('lee un Excel normal en base64', async () => {
    const bytes = smallXlsx();
    await expect(readAssistantFile(file(bytes), [])).resolves.toEqual({ id: 'excel1', nombre: 'Inventario.xlsx', contenido: toBase64(bytes) });
  });

  it('no deja mandar un xlsx que se expande de más', async () => {
    const bomb = zipFixture([{ name: 'xl/worksheets/sheet1.xml', size: 200 * MB, compressed: 200_000 }]);
    await expect(readAssistantFile(file(bomb, 'Bomba.xlsx'), [])).rejects.toThrow(/se expande demasiado/);
  });
});
