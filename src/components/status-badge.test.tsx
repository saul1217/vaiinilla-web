import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EstablishmentStatusBadge, InvitationStatusBadge } from './status-badge';

describe('status badges', () => {
  it.each([
    ['pendiente', 'Pendiente'],
    ['aceptada', 'Aceptada'],
    ['revocada', 'Revocada'],
    ['reemplazada', 'Reemplazada'],
    ['expirada', 'Expirada'],
  ] as const)('muestra el estado %s con una etiqueta legible', (status, label) => {
    render(<InvitationStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('distingue un establecimiento suspendido', () => {
    render(<EstablishmentStatusBadge status="suspendido" />);
    expect(screen.getByText('Suspendido')).toHaveClass('status-badge--suspendido');
  });
});
