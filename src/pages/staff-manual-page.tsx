// «Paso a paso» del personal: buscar un procedimiento de Caja, Cocina o Mesero y leerlo
// paso por paso, aunque no haya una operación activa. Textos en src/lib/staff-manual.ts.
import { ArrowLeft, BookOpen, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { SegmentedControl } from '../components/segmented-control';
import { Button, Field } from '../components/ui';
import { useSessions } from '../context/session-context';
import { manualGuides, manualMatches, manualRoleFor, manualSections, type ManualGuide, type ManualRole } from '../lib/staff-manual';

export function StaffManualPage() {
  const { tenant } = useSessions();
  const [role, setRole] = useState<ManualRole>(() => manualRoleFor(tenant?.context.rol));
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string | null>(null);
  const [open, setOpen] = useState<ManualGuide | null>(null);
  const guides = manualGuides(role);
  const sections = manualSections(guides);
  const visible = guides.filter((guide) => (section === null || guide.section === section) && manualMatches(guide, query));

  if (open) {
    return (
      <main className="page-stack admin-screen staff-manual">
        <AppPageHeader eyebrow={`Paso a paso · ${role}`} title={open.title}
          action={<Button variant="ghost" onClick={() => setOpen(null)}><ArrowLeft aria-hidden="true" className="size-4" /> Manual</Button>} />
        <ol className="staff-manual__steps">
          {open.steps.map((item, index) => (
            <li key={item.title}>
              <span className="staff-manual__number" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="staff-manual__done"><CheckCircle2 aria-hidden="true" className="size-5" /> {open.completion}</p>
      </main>
    );
  }

  return (
    <main className="page-stack admin-screen staff-manual">
      <AppPageHeader eyebrow="Paso a paso" title={`Manual de ${role}`} description="Procedimientos completos, aunque no haya una operación activa." />
      <SegmentedControl legend="Manual de" value={role}
        options={[{ value: 'Caja', label: 'Caja' }, { value: 'Cocina', label: 'Cocina' }, { value: 'Mesero', label: 'Mesero' }]}
        onChange={(next) => { setRole(next); setSection(null); }} />
      <Field name="manual-search" label="Buscar en el manual" placeholder="Busca: cerrar caja, QR, cuenta…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="staff-manual__sections" role="group" aria-label="Secciones">
        <Button variant={section === null ? 'dark' : 'secondary'} aria-pressed={section === null} onClick={() => setSection(null)}>Todo</Button>
        {sections.map((name) => (
          <Button key={name} variant={section === name ? 'dark' : 'secondary'} aria-pressed={section === name} onClick={() => setSection(name)}>{name}</Button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="staff-manual__empty">No encontramos nada con «{query.trim()}». Prueba con otra palabra.</p>
      ) : (
        <ul className="staff-manual__list">
          {visible.map((guide) => (
            <li key={guide.id}>
              <button type="button" onClick={() => setOpen(guide)}>
                <BookOpen aria-hidden="true" className="size-5" />
                <span>
                  <strong>{guide.title}</strong>
                  <small>{guide.section} · {guide.steps.length} pasos</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
