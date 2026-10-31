import type { ReactNode, RefObject } from 'react';
import type { ManagedSpace } from '../types/api';
import { AppSheet } from './app-sheet';

export function SpaceEditorSheet({
  space,
  open,
  onOpenChange,
  children,
  returnFocusRef,
}: {
  space: ManagedSpace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={space.nombre}
      description="Edita los datos del espacio."
      size="large"
      returnFocusRef={returnFocusRef}
    >
      <AppSheet.Body>
        <div className="space-editor-sheet">{children}</div>
      </AppSheet.Body>
    </AppSheet>
  );
}
