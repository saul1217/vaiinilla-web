import type { ComponentProps, ReactNode } from 'react';
import { Modal } from './ui';

/** One Radix dialog and one mounted content tree at every viewport. */
export function AppSheet(props: Omit<ComponentProps<typeof Modal>, 'presentation'>) {
  return <Modal {...props} presentation="responsive-sheet" />;
}

AppSheet.Header = function AppSheetHeader({ children }: { children: ReactNode }) {
  return <div className="app-sheet__intro">{children}</div>;
};
AppSheet.Body = function AppSheetBody({ children }: { children: ReactNode }) {
  return <div className="app-sheet__body">{children}</div>;
};
AppSheet.Footer = function AppSheetFooter({ children }: { children: ReactNode }) {
  return <div className="app-sheet__footer">{children}</div>;
};
