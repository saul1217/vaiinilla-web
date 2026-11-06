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
  const availability = useQuery({ queryKey: ['store-assistant-availability'], enabled: !!token, retry: false, queryFn: () => api.businessSettings(token) });
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [notice, setNotice] = useState('');
  const ask = useMutation({ mutationFn: (next: Message[]) => api.askStoreAssistant(token, next), onSuccess: value => { const result = value as Reply; setReply(result); if (result.mensaje) setMessages(old => [...old, { rol: 'asistente', texto: result.mensaje! }]); } });
  const apply = useMutation({ mutationFn: () => api.saveBusinessSettings(token, (reply?.propuesta?.cambios ?? {}) as BusinessSettingsInput), onSuccess: () => setNotice('Cambios aplicados a la configuración del negocio.') });
  // Check the existing settings resource; never call the model just to probe availability.
  if (availability.isLoading || availability.isError) return null;
  const send = (text: string) => {
    const next = [...messages, { rol: 'dueno' as const, texto: text }];
    setMessages(next);
    setDraft('');
    setReply(null);
    ask.reset();
    ask.mutate(next);
  };
  const retryAsk = () => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.rol === 'dueno') {
      ask.reset();
      ask.mutate(messages);
    }
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
      {ask.isError && <Feedback tone="error">No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.<button className="button button--secondary" type="button" onClick={retryAsk}>Reintentar envío</button></Feedback>}
      {reply?.opciones?.length ? <div className="flex flex-wrap gap-2" aria-label="Respuestas sugeridas">{reply.opciones.map(option => <button className="button button--secondary" type="button" key={option} disabled={ask.isPending} onClick={() => send(option)}>{option}</button>)}</div> : null}
      {reply?.propuesta?.cambios && <section aria-labelledby="assistant-proposal"><h2 id="assistant-proposal">Propuesta para revisar</h2><pre>{JSON.stringify(reply.propuesta.cambios, null, 2)}</pre><button className="button" type="button" disabled={apply.isPending} onClick={() => { setNotice(''); apply.reset(); apply.mutate(); }}>Aceptar y aplicar cambios</button>{apply.isError && <Feedback tone="error">No se pudieron aplicar los cambios. Inténtalo de nuevo.<button className="button button--secondary" type="button" onClick={() => { apply.reset(); apply.mutate(); }}>Reintentar aplicación</button></Feedback>}</section>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
    </section>
  </main>;
}
