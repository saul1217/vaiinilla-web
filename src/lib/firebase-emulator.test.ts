import { describe, expect, it } from 'vitest';
import { authEmulatorUrl } from './firebase';

describe('authEmulatorUrl', () => {
  it('solo conecta el emulador local con el servidor de desarrollo', () => {
    expect(authEmulatorUrl('127.0.0.1:9099', true)).toBe('http://127.0.0.1:9099');
    expect(authEmulatorUrl(' localhost:41234 ', true)).toBe('http://localhost:41234');
  });

  it('un build de producción nunca usa el emulador', () => {
    expect(authEmulatorUrl('127.0.0.1:9099', false)).toBeNull();
  });

  it('ignora valores vacíos o que no sean un host local', () => {
    expect(authEmulatorUrl(undefined, true)).toBeNull();
    expect(authEmulatorUrl('', true)).toBeNull();
    expect(authEmulatorUrl('emulador.ejemplo.com:9099', true)).toBeNull();
    expect(authEmulatorUrl('http://127.0.0.1:9099', true)).toBeNull();
  });
});
