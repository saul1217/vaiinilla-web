import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { SegmentedControl } from './segmented-control';

function Example() {
  const [value, setValue] = useState('all');
  return <><SegmentedControl legend="Mesas" value={value} onChange={setValue} options={[
    { value: 'all', label: 'Todas' }, { value: 'disabled', label: 'No disponible', disabled: true },
    { value: 'pending', label: 'Por atender' }, { value: 'last', label: 'Últimas' },
  ]} /><button>Después</button></>;
}
it('radios con un tab stop, flechas circulares y Home/End omiten opciones deshabilitadas', async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.getByRole('group', { name: 'Mesas' })).toBeInTheDocument();
  await user.tab();
  expect(screen.getByRole('radio', { name: 'Todas' })).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('radio', { name: 'Por atender' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Por atender' })).toHaveFocus();
  await user.keyboard('{End}');
  expect(screen.getByRole('radio', { name: 'Últimas' })).toBeChecked();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked();
  await user.keyboard('{ArrowLeft}{Home}');
  expect(screen.getByRole('radio', { name: 'Todas' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Después' })).toHaveFocus();
});
