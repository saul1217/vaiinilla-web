import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  it('usa VITE_API_URL sin la diagonal final', () => {
    expect(resolveApiUrl('https://example.test/api/v1/')).toBe('https://example.test/api/v1');
  });

  it('falla claro si falta VITE_API_URL', () => {
    expect(() => resolveApiUrl(undefined)).toThrow(/VITE_API_URL/);
    expect(() => resolveApiUrl(' ')).toThrow(/VITE_API_URL/);
  });
});
