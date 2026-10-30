import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SpacePaymentSheet } from './space-payment-sheet';

function Steps({ openerState = 'visible' }: { openerState?: 'visible' | 'removed' | 'hidden' | 'disabled' }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  return <>
    <h2 ref={heading} tabIndex={-1}>Mesa 67</h2>
    {!(done && openerState === 'removed') && <button
      hidden={done && openerState === 'hidden'}
      disabled={done && openerState === 'disabled'}
      onClick={() => setOpen(true)}
    >Entregar</button>}
    <SpacePaymentSheet embedded open={open} fallbackFocusRef={heading} title="Entregar pedido 28"
      onBack={() => setOpen(false)} onOpenChange={setOpen}>
      <button onClick={() => setOpen(false)}>Cancelar</button>
      <button onClick={() => { setDone(true); setOpen(false); }}>Confirmar entrega</button>
    </SpacePaymentSheet>
  </>;
}

describe('retorno de foco del paso embebido', () => {
  it.each(['Volver a la cuenta', 'Cancelar'])('%s devuelve el foco al disparador', async (action) => {
    const user = userEvent.setup();
    render(<Steps />);
    const opener = screen.getByRole('button', { name: 'Entregar' });
    await user.click(opener);
    expect(screen.getByRole('heading', { name: 'Entregar pedido 28' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: action }));
    expect(opener).toHaveFocus();
  });

  it.each(['removed', 'hidden', 'disabled'] as const)('al entregar usa la cabecera si el disparador queda %s', async (openerState) => {
    const user = userEvent.setup();
    render(<Steps openerState={openerState} />);
    await user.click(screen.getByRole('button', { name: 'Entregar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    expect(screen.getByRole('heading', { name: 'Mesa 67' })).toHaveFocus();
  });
});
