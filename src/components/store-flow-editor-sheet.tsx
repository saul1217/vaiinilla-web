import type { MouseEvent, ReactNode } from 'react';
import { AppSheet } from './app-sheet';
import { Button } from './ui';

export type StoreFlowEditor = 'payments' | 'directory' | 'media' | 'flow' | null;

export function StoreFlowEditorSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="large"
      returnFocusRef={returnFocusRef}
    >
      <AppSheet.Body>{children}</AppSheet.Body>
      {footer && <AppSheet.Footer>{footer}</AppSheet.Footer>}
    </AppSheet>
  );
}

export function StoreFlowEditButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button type="button" variant="secondary" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}
