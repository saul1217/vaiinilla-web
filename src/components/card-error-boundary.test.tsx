import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardErrorBoundary } from './card-error-boundary';

function Boom(): never {
  throw new Error('boom');
}

describe('CardErrorBoundary', () => {
  it('muestra un aviso en la tarjeta y deja el resto', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <p>Resto</p>
        <CardErrorBoundary label="Cuentas sin cobrar">
          <Boom />
        </CardErrorBoundary>
      </div>,
    );
    expect(screen.getByText('Resto')).toBeInTheDocument();
    expect(screen.getByText(/No se pudo mostrar/)).toBeInTheDocument();
  });
});
