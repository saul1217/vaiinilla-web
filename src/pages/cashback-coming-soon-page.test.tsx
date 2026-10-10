import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CashbackComingSoonPage } from './cashback-coming-soon-page';

describe('CashbackComingSoonPage', () => {
  it('explica que los flujos todavía no están disponibles y señala Próximamente', () => {
    render(<CashbackComingSoonPage />);

    expect(screen.getByRole('heading', { name: 'Cashback y wallet' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Próximamente');
    expect(screen.getByText(/todavía no están habilitados para uso diario/i)).toBeInTheDocument();
    expect(screen.getByText(/Caja \/ POS/)).toBeInTheDocument();
  });
});
