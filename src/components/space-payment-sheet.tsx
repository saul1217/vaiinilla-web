import { useEffect, useRef, type ComponentProps } from 'react';
import { AppSheet } from './app-sheet';
import { Button } from './ui';

/** Embedded steps share the table's Radix dialog; standalone consumers keep one sheet. */
export function SpacePaymentSheet({ embedded = false, onBack, ...props }: ComponentProps<typeof AppSheet> & { embedded?: boolean; onBack?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!embedded) return;
    if (props.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      heading.current?.focus();
    } else if (opener.current) {
      const target = [opener.current, props.fallbackFocusRef?.current].find((element) => {
        if (!element?.isConnected || element === document.body || element.matches(':disabled, [aria-disabled="true"]')) return false;
        if (!element.matches('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex], [contenteditable="true"]')) return false;
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || node.inert || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        }
        return true;
      });
      target?.focus();
      opener.current = null;
    }
  }, [embedded, props.open, props.fallbackFocusRef]);
  if (!embedded) return <AppSheet {...props} />;
  return <section hidden={!props.open} className="space-payment-step" data-open={props.open}>
    <Button variant="ghost" onClick={onBack ?? (() => props.onOpenChange(false))}>Volver a la cuenta</Button>
    <h3 ref={heading} tabIndex={-1}>{props.title}</h3>
    {props.description && <p className="space-account__hint">{props.description}</p>}
    {props.children}
  </section>;
}
