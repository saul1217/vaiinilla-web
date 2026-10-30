import type { ReactNode } from 'react';

export function AppPageHeader({ eyebrow, title, action, description, connected = false, headingLevel = 1, id }: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Only pass a real connection signal; polling alone is insufficient. */
  connected?: boolean;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return <header className="app-page-header">
    <div className="app-page-header__text">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Heading id={id} tabIndex={-1}>{title}</Heading>
      {description && <p className="app-page-header__description">{description}</p>}
    </div>
    <div className="app-page-header__actions">
      {connected && <span className="app-page-header__live"><span aria-hidden="true" />En vivo</span>}
      {action}
    </div>
  </header>;
}

export function AppSectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <AppPageHeader eyebrow="" title={title} description={description} action={action} headingLevel={2} />;
}
