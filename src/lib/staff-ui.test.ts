import { afterEach, describe, expect, it } from 'vitest';
import { readStaffUi, splitSpaceName } from './staff-ui';

describe('presentación del personal', () => {
  afterEach(() => window.localStorage.clear());

  it('empieza en la nueva y recuerda la anterior si se eligió', () => {
    expect(readStaffUi()).toBe('nueva');
    window.localStorage.setItem('vaiinilla.panel.staff-ui', 'anterior');
    expect(readStaffUi()).toBe('anterior');
  });

  it('separa el número del tipo de espacio, como los mosaicos de la app', () => {
    expect(splitSpaceName('Mesa 2')).toEqual({ number: '2', kind: 'Mesa' });
    expect(splitSpaceName('VIP vaini 12')).toEqual({ number: '12', kind: 'VIP vaini' });
    expect(splitSpaceName('Barra')).toEqual({ number: null, kind: 'Barra' });
    expect(splitSpaceName('7')).toEqual({ number: '7', kind: '' });
  });
});
