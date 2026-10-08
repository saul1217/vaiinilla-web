import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EstablishmentStatusBadge,
  InvitationStatusBadge,
  OrderStatusBadge,
} from './status-badge';

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

  it('muestra un pedido pendiente de cobro sin depender solo del color', () => {
    render(<OrderStatusBadge status="cobrado" estadoOperativo="recibido" estadoPago="pendiente" />);
    expect(screen.getByText('Recibido')).toHaveClass('status-badge--order-recibido');
    expect(screen.getByText('Pago pendiente')).toHaveClass('status-badge--payment-pendiente');
  });

  it('un pedido a la cuenta mantiene recibido aunque su estado legado sea cobrado', () => {
    render(<OrderStatusBadge status="cobrado" estadoOperativo="recibido" estadoPago="pendiente" pagoPendiente />);
    expect(screen.getByText('Recibido')).toHaveClass('status-badge--order-recibido');
    expect(screen.getByText('Pago pendiente')).toHaveClass('status-badge--payment-pendiente');
  });

  it('la compatibilidad con una respuesta anterior nunca muestra cobrado como estado operativo', () => {
    render(<OrderStatusBadge status="cobrado" pagoPendiente />);
    expect(screen.getByText('Recibido')).toHaveClass('status-badge--order-recibido');
    expect(screen.getByText('Pendiente')).toHaveClass('status-badge--payment-pendiente');
    expect(screen.queryByText('Cobrado')).not.toBeInTheDocument();
  });

  it('un pedido efectivamente pagado muestra pago y avance operativo por separado', () => {
    render(<OrderStatusBadge status="cobrado" estadoOperativo="recibido" estadoPago="pagado" />);
    expect(screen.getByText('Recibido')).toHaveClass('status-badge--order-recibido');
    expect(screen.getByText('Pagado')).toHaveClass('status-badge--payment-pagado');
  });
});
