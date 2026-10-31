import type { ComponentProps } from 'react';
import { AppSheet } from './app-sheet';

export function SpaceDetailSheet(props: ComponentProps<typeof AppSheet>) {
  return <AppSheet {...props} />;
}
