import { describe, expect, it, vi } from 'vitest';
import { canWriteNfc, writeNfcUrl } from './nfc-tag';

describe('etiquetas NFC', () => {
  it('sin Web NFC no ofrece grabar y avisa si se intenta', async () => {
    const plain = {} as Window;
    expect(canWriteNfc(plain)).toBe(false);
    await expect(writeNfcUrl('https://vaiinilla.app/x/m/y', plain)).rejects.toThrow(/NFC/);
  });

  it('con Web NFC graba el enlace como registro URL', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class FakeReader {
      write = write;
    }
    const nfc = { NDEFReader: FakeReader } as unknown as Window;
    expect(canWriteNfc(nfc)).toBe(true);
    await writeNfcUrl('https://vaiinilla.app/x/m/y', nfc);
    expect(write).toHaveBeenCalledWith({ records: [{ recordType: 'url', data: 'https://vaiinilla.app/x/m/y' }] });
  });
});
