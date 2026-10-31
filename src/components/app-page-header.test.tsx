import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AppPageHeader } from './app-page-header';

it('no anuncia En vivo sin señal y permite una jerarquía de sección explícita', () => {
  const view = render(<AppPageHeader title="Mesas" eyebrow="Caja" headingLevel={2} />);
  expect(screen.getByRole('heading', { name: 'Mesas', level: 2 })).toBeInTheDocument();
  expect(screen.queryByText('En vivo')).not.toBeInTheDocument();
  view.rerender(<AppPageHeader title="Mesas" eyebrow="Mesero" connected />);
  expect(screen.getByRole('heading', { name: 'Mesas', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('En vivo')).toBeInTheDocument();
});
