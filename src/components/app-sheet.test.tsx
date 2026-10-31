import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AppSheet } from './app-sheet';

function Example({ removeOpener = false }: { removeOpener?: boolean }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [step, setStep] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const fallback = useRef<HTMLHeadingElement>(null);
  return <><h1 ref={fallback} tabIndex={-1}>Cuenta</h1>
    {!removed && <button ref={opener} onClick={() => { setOpen(true); if (removeOpener) setRemoved(true); }}>Abrir</button>}
    <AppSheet open={open} onOpenChange={setOpen} title="Detalle" description="Cuenta actual" returnFocusRef={opener} fallbackFocusRef={fallback}>
      <AppSheet.Body><label>Nombre<input /></label><p>{step ? 'Segundo paso' : 'Primer paso'}</p>
        <button onClick={() => setStep(!step)}>{step ? 'Volver' : 'Siguiente'}</button></AppSheet.Body>
      <AppSheet.Footer><button onClick={() => setOpen(false)}>Terminar</button></AppSheet.Footer>
    </AppSheet></>;
}

it('enfoca el título sin abrir teclado, contiene Tab, conserva draft entre pasos y restaura foco con Escape', async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole('button', { name: 'Abrir' }));
  const dialog = screen.getByRole('dialog', { name: 'Detalle' });
  expect(dialog).toHaveAccessibleDescription('Cuenta actual');
  expect(screen.getByRole('heading', { name: 'Detalle' })).toHaveFocus();
  await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Ana');
  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
  await user.click(screen.getByRole('button', { name: 'Volver' }));
  expect(screen.getByRole('textbox')).toHaveValue('Ana');
  screen.getByRole('button', { name: 'Terminar' }).focus();
  await user.tab();
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
});

it('devuelve foco a una cabecera conectada si desaparece el disparador', async () => {
  const user = userEvent.setup();
  render(<Example removeOpener />);
  await user.click(screen.getByRole('button', { name: 'Abrir' }));
  await user.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Cuenta' })).toHaveFocus());
});
