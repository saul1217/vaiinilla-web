import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { searchSettings, type SettingsIndexContext } from '../lib/settings-index';

/**
 * «Buscar ajuste» del admin: escribe «código», «horario» o «cocina» y te lleva a la pantalla.
 * Los ajustes del negocio se piden la primera vez que entras al campo (no en cada pantalla), y
 * solo salen los que la pantalla de destino muestra.
 */
export function SettingsSearch({ token }: { token: string }) {
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState<SettingsIndexContext>({});
  const [asked, setAsked] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!asked || !token) return;
    let alive = true;
    api.businessSettings(token).then(
      (settings) => { if (alive) setCtx({ settings }); },
      // Sin los ajustes se busca solo con las banderas: mejor eso que nada.
      () => undefined,
    );
    return () => { alive = false; };
  }, [asked, token]);

  const results = searchSettings(query, ctx).slice(0, 8);
  const typed = query.trim().length > 0;

  return (
    <div className="grid gap-1" role="search">
      <label className="field__label" htmlFor={`${listId}-input`}>Buscar ajuste</label>
      <div className="flex items-center gap-2 rounded-2xl border border-ink/15 bg-white-warm px-3 py-2 focus-within:ring-2 focus-within:ring-ink">
        <Search aria-hidden="true" className="size-4" />
        <input
          id={`${listId}-input`}
          type="search"
          className="w-full min-h-8 bg-transparent text-sm outline-none"
          autoComplete="off"
          placeholder="Ej. código, horario, cocina"
          value={query}
          aria-controls={typed ? listId : undefined}
          onFocus={() => setAsked(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }}
        />
      </div>
      {typed && (
        results.length > 0
          ? <ul id={listId} className="grid gap-1 rounded-2xl border border-ink/10 bg-white-warm p-2" aria-label="Ajustes encontrados">
            {results.map((entry) => (
              <li key={entry.id}>
                <Link to={entry.to} onClick={() => setQuery('')} className="grid rounded-xl px-3 py-2 text-sm hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
                  <strong>{entry.label}</strong>
                  <span className="text-xs text-muted">{entry.where}</span>
                </Link>
              </li>
            ))}
          </ul>
          : <p id={listId} className="text-sm text-muted" role="status">No hay un ajuste con «{query.trim()}».</p>
      )}
    </div>
  );
}
