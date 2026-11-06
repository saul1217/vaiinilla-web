import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import type { BusinessSettingsInput } from '../types/api';

type Message = { rol: 'dueno' | 'asistente'; texto: string };
type Reply = { mensaje?: string; opciones?: string[]; propuesta?: { cambios?: Record<string, unknown>; motivos?: Record<string, string> } | null };

export function AssistantConfigPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const availability = useQuery({ queryKey: ['store-assistant-availability'], enabled: !!token, retry: false, queryFn: () => api.askStoreAssistant(token, []) });
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [notice, setNotice] = useState('');
  const ask = useMutation({ mutationFn: (next: Message[]) => api.askStoreAssistant(token, next), onSuccess: value => { const result = value as Reply; setReply(result); if (result.mensaje) setMessages(old => [...old, { rol: 'asistente', texto: result.mensaje! }]); } });
  const apply = useMutation({ mutationFn: () => api.saveBusinessSettings(token, (reply?.propuesta?.cambios ?? {}) as BusinessSettingsInput), onSuccess: () => setNotice('Cambios aplicados a la configuración del negocio.') });
  // 404, unavailable, and other API failures disable the assistant view on this deployment.
  if (availability.isLoading || availability.isError || ask.isError || apply.isError) return null;
  const send = (text: string) => {
    const next = [...messages, { rol: 'dueno' as const, texto: text }];
    setMessages(next);
    setDraft('');
    setReply(null);
    ask.mutate(next);
  };
  return <main className="page-stack admin-screen admin-flow">
    <AppPageHeader eyebrow="Administración · Configuración" title="Asistente de configuración" description="Cuéntale cómo funciona tu negocio. La propuesta no se guarda hasta que la revises y la aceptes." />
    <section className="panel-card" aria-busy={ask.isPending}>
      <ol className="assistant-transcript" aria-label="Conversación" aria-live="polite">{messages.map((item, index) => <li key={`${index}-${item.rol}`}><strong>{item.rol === 'dueno' ? 'Tú' : 'Asistente'}</strong><p>{item.texto}</p></li>)}</ol>
      {!messages.length && <p>¿Qué te gustaría configurar en tu tienda?</p>}
      <form onSubmit={event => { event.preventDefault(); if (draft.trim()) send(draft.trim()); }}>
        <label>Tu mensaje<textarea value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} rows={3} /></label>
        <button className="button" type="submit" disabled={ask.isPending || !draft.trim()}>Enviar</button>
      </form>
      {ask.isPending && <p role="status">Preparando una respuesta…</p>}
      {reply?.opciones?.length ? <div className="flex flex-wrap gap-2" aria-label="Respuestas sugeridas">{reply.opciones.map(option => <button className="button button--secondary" type="button" key={option} disabled={ask.isPending} onClick={() => send(option)}>{option}</button>)}</div> : null}
      {reply?.propuesta?.cambios && <section aria-labelledby="assistant-proposal"><h2 id="assistant-proposal">Propuesta para revisar</h2><pre>{JSON.stringify(reply.propuesta.cambios, null, 2)}</pre><button className="button" type="button" disabled={apply.isPending} onClick={() => apply.mutate()}>Aceptar y aplicar cambios</button></section>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
    </section>
  </main>;
}
