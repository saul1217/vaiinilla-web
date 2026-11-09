import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage, VaiinillaApiError } from '../lib/api-error';
import { ASSISTANT_MAX_FILES, AssistantFileError, readAssistantFile } from '../lib/assistant-files';
import type { AssistantMode, BusinessSettingsInput, StoreAssistantFile, StoreAssistantMessage, StoreAssistantReply } from '../types/api';

/** Lo que acepta el backend por mensaje del dueño (MAX_LETRAS_MENSAJE). */
const MAX_MESSAGE_LENGTH = 6000;

const modeLabels: Record<AssistantMode, string> = {
  ambos: 'Tienda y clientes',
  personal: 'Solo la tienda',
  ninguno: 'Apagado',
};

/** Secciones de la propuesta que tienen su propia ruta; la web todavía no las aplica. */
const sectionLabels: Record<string, string> = {
  espacios: 'Mesas o lugares',
  menu: 'Menú',
  personal: 'Invitaciones al personal',
  fotos: 'Fotos de la tienda',
  fotos_productos: 'Fotos de productos',
  horario_pistas: 'Horario para rentar',
  insumos: 'Insumos',
  recetas: 'Recetas',
  movimientos: 'Movimientos de inventario',
  cambios_productos: 'Cambios en productos',
  cambios_insumos: 'Cambios en insumos',
  cambios_espacios: 'Cambios en mesas o lugares',
  cambios_personal: 'Cambios de puesto',
  reservas: 'Reservas',
  cancelar_pedidos: 'Pedidos por cancelar',
};

function sectionCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === null || value === undefined) return 'Sin definir';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function AssistantConfigPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const queryClient = useQueryClient();
  const availability = useQuery({ queryKey: ['store-assistant-availability'], enabled: !!token, queryFn: () => api.businessSettings(token) });
  const [messages, setMessages] = useState<StoreAssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<StoreAssistantReply | null>(null);
  const [notice, setNotice] = useState('');
  // Los Excel ya mandados viajan en cada mensaje; los pendientes se anuncian como [excelN] en el siguiente.
  const [files, setFiles] = useState<StoreAssistantFile[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const ask = useMutation({
    mutationFn: (next: StoreAssistantMessage[]) => api.askStoreAssistant(token, next, files),
    onSuccess: (result) => {
      setReply(result);
      setPendingFileIds([]);
      if (result.mensaje) setMessages((old) => [...old, { rol: 'asistente', texto: result.mensaje }]);
    },
  });
  const apply = useMutation({
    mutationFn: (input?: BusinessSettingsInput) => api.saveBusinessSettings(token, input ?? reply?.propuesta?.cambios ?? {}),
    onSuccess: (value, input) => {
      queryClient.setQueryData(['store-assistant-availability'], (previous: typeof value | undefined) => ({ ...previous, ...value, ...(input?.asistente_modo ? { asistente_modo: input.asistente_modo } : {}) }));
      if (!input?.asistente_modo) setNotice('Cambios aplicados a la configuración del negocio.');
    },
  });
  // Check the existing settings resource; never call the model just to probe availability.
  const availabilityError = availability.error;
  const assistantUnsupported = availability.isError && availabilityError instanceof VaiinillaApiError &&
    availabilityError.status === 404;
  if (assistantUnsupported) return null;

  const mode = availability.data?.asistente_modo;
  const assistantOff = mode === 'ninguno';
  const noMessagesLeft = reply?.quedan_mensajes === 0;
  const proposal = reply?.propuesta ?? null;
  const settingsChanges = Object.entries(proposal?.cambios ?? {});
  const otherSections = Object.entries(proposal ?? {})
    .filter(([key, value]) => key !== 'cambios' && key !== 'motivos' && sectionCount(value) > 0)
    .map(([key, value]) => ({ key, label: sectionLabels[key] ?? key, count: sectionCount(value) }));

  const send = (text: string) => {
    const tags = pendingFileIds.filter((id) => !text.includes(`[${id}]`)).map((id) => ` [${id}]`).join('');
    const next = [...messages, { rol: 'dueno' as const, texto: `${text}${tags}`.trim() }];
    setMessages(next);
    setDraft('');
    setReply(null);
    setNotice('');
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
  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError('');
    try {
      const read = await readAssistantFile(file, files);
      setFiles((old) => [...old, read]);
      setPendingFileIds((old) => [...old, read.id]);
    } catch (error) {
      setFileError(error instanceof AssistantFileError ? error.message : 'No se pudo leer ese archivo. Inténtalo de nuevo.');
    }
  };
  const removeFile = (id: string) => {
    setFiles((old) => old.filter((file) => file.id !== id));
    setPendingFileIds((old) => old.filter((pending) => pending !== id));
    // Si el mensaje que lo anunciaba no tuvo respuesta, vuelve al cuadro de texto sin los [excelN].
    const lastMessage = messages[messages.length - 1];
    if (ask.isError && lastMessage?.rol === 'dueno') {
      setMessages((old) => old.slice(0, -1));
      setDraft(lastMessage.texto.replace(/\s*\[excel\d\]/g, '').trim());
      ask.reset();
    }
  };
  // Un Excel que el servidor no pudo leer (ASSISTANT_FILE_INVALID) se quita para poder seguir.
  const fileRejected = ask.error instanceof VaiinillaApiError && ask.error.code === 'ASSISTANT_FILE_INVALID';
  const canSend = !ask.isPending && !noMessagesLeft && (draft.trim().length > 0 || pendingFileIds.length > 0);

  return <main className="page-stack admin-screen admin-flow">
    <AppPageHeader eyebrow="Administración · Configuración" title="Asistente de configuración" description="Cuéntale cómo funciona tu negocio o mándale tu inventario o tu menú en Excel. La propuesta no se guarda hasta que la revises y la aceptes." />
    {availability.isLoading && <LoadingState label="Cargando el asistente…" cards={1} />}
    {availability.isError && <Feedback tone="error">No se pudo cargar la configuración. Revisa tu conexión e inténtalo de nuevo.<VaiButton variant="secondary" onClick={() => void availability.refetch()}>Reintentar</VaiButton></Feedback>}
    {!availability.isLoading && !availability.isError && mode != null && <Card title="Modo del asistente" description="Quién puede usar los asistentes de Vaiinilla en tu tienda.">
      <ChipRow label="Modo del asistente">
        {(['ambos', 'personal', 'ninguno'] as AssistantMode[]).map((item) => <Chip key={item} selected={mode === item}
          disabled={apply.isPending} onClick={() => { if (mode !== item) apply.mutate({ asistente_modo: item }); }}>{modeLabels[item]}</Chip>)}
      </ChipRow>
      {apply.isError && apply.variables?.asistente_modo && <Feedback tone="error">No se pudo guardar el modo. Inténtalo de nuevo.</Feedback>}
    </Card>}
    {!availability.isLoading && !availability.isError && (assistantOff
      ? <Card tone="flat" title="El asistente está apagado" description="Elige «Solo la tienda» o «Tienda y clientes» para platicar con él." />
      : <Card aria-busy={ask.isPending}>
        <ol className="assistant-transcript" aria-label="Conversación" aria-live="polite">{messages.map((item, index) => <li key={`${index}-${item.rol}`}><strong>{item.rol === 'dueno' ? 'Tú' : 'Asistente'}</strong><p>{item.texto}</p></li>)}</ol>
        {!messages.length && <p>¿Qué te gustaría configurar en tu tienda?</p>}
        {files.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Archivos de Excel">{files.map((file) => <li key={file.id} className="vai-chip">
          <FileSpreadsheet aria-hidden="true" size={16} /> {file.nombre}
          {pendingFileIds.includes(file.id) && <button type="button" aria-label={`Quitar ${file.nombre}`} onClick={() => removeFile(file.id)}><X aria-hidden="true" size={16} /></button>}
        </li>)}</ul>}
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (canSend) send(draft.trim()); }}>
          <label>Tu mensaje<textarea value={draft} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => setDraft(event.target.value)} rows={3} disabled={noMessagesLeft} /></label>
          <input ref={fileInput} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Archivo de Excel" onChange={(event) => void pickFile(event)} />
          <div className="flex flex-wrap gap-2">
            <VaiButton type="submit" variant="accent" disabled={!canSend} loading={ask.isPending}>Enviar</VaiButton>
            <VaiButton variant="secondary" disabled={ask.isPending || noMessagesLeft || files.length >= ASSISTANT_MAX_FILES} onClick={() => fileInput.current?.click()}><FileSpreadsheet aria-hidden="true" size={18} /> Mandar un Excel</VaiButton>
          </div>
        </form>
        {fileError && <Feedback tone="error">{fileError}</Feedback>}
        {ask.isPending && <p role="status">Preparando una respuesta… Con un Excel o una lista larga puede tardar unos minutos.</p>}
        {ask.isError && <Feedback tone="error">{ask.error instanceof VaiinillaApiError ? errorMessage(ask.error) : 'No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.'}
          {!fileRejected && <VaiButton variant="secondary" onClick={retryAsk}>Reintentar envío</VaiButton>}</Feedback>}
        {reply?.quedan_mensajes !== undefined && reply.quedan_mensajes <= 10 && <p role="status">{noMessagesLeft ? 'La plática llegó a su límite. Recarga la página para empezar otra.' : `Quedan ${reply.quedan_mensajes} mensajes en esta plática.`}</p>}
        {reply?.opciones?.length ? <ChipRow label="Respuestas sugeridas">{reply.opciones.map((option) => <Chip key={option} selected={false} disabled={ask.isPending || noMessagesLeft} onClick={() => send(option)}>{option}</Chip>)}</ChipRow> : null}
        {proposal && <section aria-labelledby="assistant-proposal" className="grid gap-3">
          <h2 id="assistant-proposal">Propuesta para revisar</h2>
          {settingsChanges.length > 0 && <ul aria-label="Ajustes del negocio">{settingsChanges.map(([key, value]) => <li key={key}><strong>{key}</strong>: {formatValue(value)}{proposal.motivos?.[key] ? <span> · {proposal.motivos[key]}</span> : null}</li>)}</ul>}
          {otherSections.length > 0 && <Feedback tone="info">
            También propone: {otherSections.map((section) => `${section.label} (${section.count})`).join(', ')}. Eso se aplica desde la app de Vaiinilla en el teléfono; aquí solo se guardan los ajustes del negocio.
          </Feedback>}
          {settingsChanges.length > 0 && <VaiButton variant="accent" disabled={apply.isPending} loading={apply.isPending} onClick={() => { setNotice(''); apply.reset(); apply.mutate(undefined); }}>Aceptar y aplicar cambios</VaiButton>}
          {apply.isError && !apply.variables && <Feedback tone="error">No se pudieron aplicar los cambios. Inténtalo de nuevo.<VaiButton variant="secondary" onClick={() => { apply.reset(); apply.mutate(undefined); }}>Reintentar aplicación</VaiButton></Feedback>}
        </section>}
        {notice && <Feedback tone="success">{notice}</Feedback>}
      </Card>)}
  </main>;
}
