import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage, VaiinillaApiError } from '../lib/api-error';
import { ASSISTANT_MAX_FILES, AssistantFileError, readAssistantFile } from '../lib/assistant-files';
import {
  applyStep,
  availableSections,
  isAlreadyDone,
  parseProposal,
  proposalSteps,
  SECTION_LABELS,
  sectionItems,
  stepErrorMessage,
  stepKey,
  type ParsedProposal,
  type SectionKey,
} from '../lib/assistant-proposal';
import type { AssistantMode, StoreAssistantFile, StoreAssistantMessage } from '../types/api';

/** Lo que acepta el backend por mensaje del dueño (MAX_LETRAS_MENSAJE). */
const MAX_MESSAGE_LENGTH = 6000;

const modeLabels: Record<AssistantMode, string> = {
  ambos: 'Tienda y clientes',
  personal: 'Solo la tienda',
  ninguno: 'Apagado',
};

const roleLabels: Record<string, string> = { cajero: 'Caja', cocina: 'Cocina', mesero: 'Mesero', admin: 'Administrador' };
const movementLabels: Record<string, string> = { entrada: 'Entrada', merma: 'Merma', conteo: 'Conteo' };
const stationLabels: Record<string, string> = { cocina: 'cocina', caja: 'barra', ninguna: 'ya está listo' };

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === null || value === undefined) return 'Sin definir';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** Las líneas que se enseñan en la revisión de cada sección. */
function sectionLines(proposal: ParsedProposal, key: SectionKey): string[] {
  switch (key) {
    case 'cambios':
      return Object.entries(proposal.cambios).map(([field, value]) => `${field}: ${formatValue(value)}${proposal.motivos[field] ? ` · ${proposal.motivos[field]}` : ''}`);
    case 'espacios':
      return proposal.espacios.map((g) => `${g.prefijo} 1 a ${g.prefijo} ${g.cantidad}${g.precio_hora ? ` · $${g.precio_hora} por hora` : ''}`);
    case 'menu':
      return proposal.menu.flatMap((c) => c.productos.map((p) => `${c.categoria}: ${p.nombre} · $${p.precio} · ${stationLabels[p.prepara]}`));
    case 'insumos':
      return proposal.insumos.map((i) => [i.nombre, `en ${i.unidad}`, i.existencia_inicial !== null ? `tienes ${i.existencia_inicial}` : null, i.minimo ? `avisa con ${i.minimo}` : null].filter(Boolean).join(' · '));
    case 'recetas':
      return proposal.recetas.map((r) => `${r.producto}: ${r.lineas.map((l) => `${l.cantidad} ${l.unidad} de ${l.insumo}`.replace('  ', ' ')).join(', ')}`);
    case 'movimientos':
      return proposal.movimientos.map((m) => `${movementLabels[m.tipo]} de ${m.insumo}: ${m.cantidad} ${m.unidad}${m.nota ? ` · ${m.nota}` : ''}`.trim());
    case 'reservas':
      return proposal.reservas.map((b) => `${b.espacio} · ${b.inicio_local.replace('T', ' ')} · ${b.duracion_min} min${b.nombre_cliente ? ` · ${b.nombre_cliente}` : ''} · queda por cobrar en Caja`);
    case 'personal':
      return proposal.personal.map((p) => `${p.email} · ${roleLabels[p.rol] ?? p.rol}`);
  }
}

interface StepFailure { id: string; label: string; message: string }

/**
 * La plática, los Excel y la propuesta viven en este componente y se reinician con cada identidad y negocio
 * (AssistantConfigPage le pone `key`). Lo que conteste el servidor después de cambiar de sesión se descarta.
 */
export function AssistantConfigPage() {
  const { tenant } = useSessions();
  const scope = tenant ? `${tenant.context.usuario_id}:${tenant.context.establecimiento_id}` : 'sin-sesion';
  return <AssistantConfigScreen key={scope} scope={scope} token={tenant?.token ?? ''} />;
}

function AssistantConfigScreen({ scope, token }: { scope: string; token: string }) {
  const queryClient = useQueryClient();
  const availabilityKey = ['store-assistant-availability', scope];
  const availability = useQuery({ queryKey: availabilityKey, enabled: !!token, queryFn: () => api.businessSettings(token) });
  const [messages, setMessages] = useState<StoreAssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [notice, setNotice] = useState('');
  // Los Excel ya mandados viajan en cada mensaje; los pendientes se anuncian como [excelN] en el siguiente.
  const [files, setFiles] = useState<StoreAssistantFile[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<unknown>(null);
  // La propuesta pendiente no se pierde si falla el siguiente envío: solo la reemplaza otra propuesta.
  const [proposal, setProposal] = useState<ParsedProposal | null>(null);
  const [proposalKey, setProposalKey] = useState('');
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<StepFailure[]>([]);
  const [applying, setApplying] = useState<SectionKey | null>(null);
  const [progress, setProgress] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const askAbort = useRef<AbortController | null>(null);
  const askSeq = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      // Cambió la sesión o el negocio (o se salió de la pantalla): nada de lo que llegue tarde se usa.
      alive.current = false;
      askAbort.current?.abort();
    };
  }, []);

  const changeMode = useMutation({
    mutationFn: (mode: AssistantMode) => api.saveBusinessSettings(token, { asistente_modo: mode }),
    onSuccess: (value, mode) => {
      if (!alive.current) return;
      queryClient.setQueryData(availabilityKey, (previous: typeof value | undefined) => ({ ...previous, ...value, asistente_modo: mode }));
    },
  });

  // Check the existing settings resource; never call the model just to probe availability.
  const availabilityError = availability.error;
  const assistantUnsupported = availability.isError && availabilityError instanceof VaiinillaApiError &&
    availabilityError.status === 404;
  if (assistantUnsupported) return null;

  const mode = availability.data?.asistente_modo;
  const assistantOff = mode === 'ninguno';
  const noMessagesLeft = remaining === 0;
  const sections = proposal ? availableSections(proposal) : [];
  const allSteps = proposal ? proposalSteps(proposal, new Set(sections)) : [];

  const ask = async (next: StoreAssistantMessage[]) => {
    askAbort.current?.abort();
    const controller = new AbortController();
    askAbort.current = controller;
    const seq = ++askSeq.current;
    const current = () => alive.current && seq === askSeq.current && !controller.signal.aborted;
    setAsking(true);
    setAskError(null);
    try {
      const result = await api.askStoreAssistant(token, next, files, controller.signal);
      if (!current()) return;
      setPendingFileIds([]);
      setOptions(result.opciones ?? []);
      setRemaining(result.quedan_mensajes);
      if (result.mensaje) setMessages((old) => [...old, { rol: 'asistente', texto: result.mensaje }]);
      const parsed = parseProposal(result.propuesta);
      if (parsed) {
        // Una propuesta nueva reemplaza a la anterior y se aplica desde cero, con llaves nuevas.
        setProposal(parsed);
        setProposalKey(crypto.randomUUID());
        setApplied(new Set());
        setFailures([]);
      }
    } catch (error) {
      if (current()) setAskError(error);
    } finally {
      if (current()) setAsking(false);
    }
  };

  const send = (text: string) => {
    const tags = pendingFileIds.filter((id) => !text.includes(`[${id}]`)).map((id) => ` [${id}]`).join('');
    const next = [...messages, { rol: 'dueno' as const, texto: `${text}${tags}`.trim() }];
    setMessages(next);
    setDraft('');
    setOptions([]);
    setNotice('');
    void ask(next);
  };
  const retryAsk = () => {
    if (messages[messages.length - 1]?.rol === 'dueno') void ask(messages);
  };

  /** Aplica una sección: solo cuando el usuario lo pide, y solo los pasos que no han quedado. */
  const applySection = async (section: SectionKey) => {
    if (!proposal || applying) return;
    const steps = proposalSteps(proposal, new Set([section])).filter((step) => !applied.has(step.id));
    setApplying(section);
    setNotice('');
    setFailures((old) => old.filter((f) => !f.id.startsWith(`${section}-`)));
    const done = new Set(applied);
    const failed: StepFailure[] = [];
    for (const [index, step] of steps.entries()) {
      // Si cambió de sesión o de negocio a media aplicación, no se escribe nada más.
      if (!alive.current) return;
      setProgress(`Guardando ${index + 1} de ${steps.length}`);
      try {
        await applyStep(token, step, await stepKey(proposalKey, step.id));
        done.add(step.id);
      } catch (error) {
        if (isAlreadyDone(error)) done.add(step.id);
        else failed.push({ id: step.id, label: step.label, message: stepErrorMessage(error) });
      }
    }
    if (!alive.current) return;
    setApplied(done);
    setFailures((old) => [...old, ...failed]);
    setApplying(null);
    setProgress('');
    if (section === 'cambios') void queryClient.invalidateQueries({ queryKey: availabilityKey });
    if (!failed.length) setNotice(`${SECTION_LABELS[section]}: guardado en tu tienda.`);
  };

  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError('');
    try {
      const read = await readAssistantFile(file, files);
      if (!alive.current) return;
      setFiles((old) => [...old, read]);
      setPendingFileIds((old) => [...old, read.id]);
    } catch (error) {
      if (alive.current) setFileError(error instanceof AssistantFileError ? error.message : 'No se pudo leer ese archivo. Inténtalo de nuevo.');
    }
  };
  const removeFile = (id: string) => {
    setFiles((old) => old.filter((file) => file.id !== id));
    setPendingFileIds((old) => old.filter((pending) => pending !== id));
    // Si el mensaje que lo anunciaba no tuvo respuesta, vuelve al cuadro de texto sin los [excelN].
    const lastMessage = messages[messages.length - 1];
    if (askError && lastMessage?.rol === 'dueno') {
      setMessages((old) => old.slice(0, -1));
      setDraft(lastMessage.texto.replace(/\s*\[excel\d\]/g, '').trim());
      setAskError(null);
    }
  };
  // Un Excel que el servidor no pudo leer (ASSISTANT_FILE_INVALID) se quita para poder seguir.
  const fileRejected = askError instanceof VaiinillaApiError && askError.code === 'ASSISTANT_FILE_INVALID';
  const canSend = !asking && !noMessagesLeft && (draft.trim().length > 0 || pendingFileIds.length > 0);

  return <main className="page-stack admin-screen admin-flow">
    <AppPageHeader eyebrow="Administración · Configuración" title="Asistente de configuración" description="Cuéntale cómo funciona tu negocio o mándale tu inventario o tu menú en Excel. Nada se guarda hasta que revises cada sección y la apliques." />
    {availability.isLoading && <LoadingState label="Cargando el asistente…" cards={1} />}
    {availability.isError && <Feedback tone="error">No se pudo cargar la configuración. Revisa tu conexión e inténtalo de nuevo.<VaiButton variant="secondary" onClick={() => void availability.refetch()}>Reintentar</VaiButton></Feedback>}
    {!availability.isLoading && !availability.isError && mode != null && <Card title="Modo del asistente" description="Quién puede usar los asistentes de Vaiinilla en tu tienda.">
      <ChipRow label="Modo del asistente">
        {(['ambos', 'personal', 'ninguno'] as AssistantMode[]).map((item) => <Chip key={item} selected={mode === item}
          disabled={changeMode.isPending} onClick={() => { if (mode !== item) changeMode.mutate(item); }}>{modeLabels[item]}</Chip>)}
      </ChipRow>
      {changeMode.isError && <Feedback tone="error">No se pudo guardar el modo. Inténtalo de nuevo.</Feedback>}
    </Card>}
    {!availability.isLoading && !availability.isError && (assistantOff
      ? <Card tone="flat" title="El asistente está apagado" description="Elige «Solo la tienda» o «Tienda y clientes» para platicar con él." />
      : <Card aria-busy={asking}>
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
            <VaiButton type="submit" variant="accent" disabled={!canSend} loading={asking}>Enviar</VaiButton>
            <VaiButton variant="secondary" disabled={asking || noMessagesLeft || files.length >= ASSISTANT_MAX_FILES} onClick={() => fileInput.current?.click()}><FileSpreadsheet aria-hidden="true" size={18} /> Mandar un Excel</VaiButton>
          </div>
        </form>
        {fileError && <Feedback tone="error">{fileError}</Feedback>}
        {asking && <p role="status">Preparando una respuesta… Con un Excel o una lista larga puede tardar unos minutos.</p>}
        {askError !== null && <Feedback tone="error">{askError instanceof VaiinillaApiError ? errorMessage(askError) : 'No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.'}
          {proposal && ' La propuesta que tenías sigue abajo.'}
          {!fileRejected && <VaiButton variant="secondary" onClick={retryAsk}>Reintentar envío</VaiButton>}</Feedback>}
        {remaining !== undefined && remaining <= 10 && <p role="status">{noMessagesLeft ? 'La plática llegó a su límite. Recarga la página para empezar otra.' : `Quedan ${remaining} mensajes en esta plática.`}</p>}
        {options.length ? <ChipRow label="Respuestas sugeridas">{options.map((option) => <Chip key={option} selected={false} disabled={asking || noMessagesLeft} onClick={() => send(option)}>{option}</Chip>)}</ChipRow> : null}
        {proposal && <section aria-labelledby="assistant-proposal" className="grid gap-3">
          <h2 id="assistant-proposal">Propuesta para revisar</h2>
          <p>Revisa cada sección y aplícala cuando estés de acuerdo. Lo que no apliques no se guarda.</p>
          {sections.map((section) => {
            const steps = allSteps.filter((step) => step.section === section);
            const saved = steps.every((step) => applied.has(step.id));
            const sectionFailures = failures.filter((f) => f.id.startsWith(`${section}-`));
            const headingId = `assistant-section-${section}`;
            return <Card key={section} tone="flat" aria-labelledby={headingId}>
              <h3 id={headingId}>{SECTION_LABELS[section]} ({sectionItems(proposal, section)})</h3>
              {proposal.motivos[section] && <p>{proposal.motivos[section]}</p>}
              <ul aria-label={SECTION_LABELS[section]}>{sectionLines(proposal, section).map((line, index) => <li key={index}>{line}</li>)}</ul>
              {saved
                ? <p role="status">Guardado en tu tienda.</p>
                : <VaiButton variant="accent" disabled={applying !== null} loading={applying === section}
                  onClick={() => void applySection(section)}>{sectionFailures.length ? `Reintentar lo que faltó en ${SECTION_LABELS[section]}` : `Aplicar ${SECTION_LABELS[section]}`}</VaiButton>}
              {applying === section && progress && <p role="status">{progress}</p>}
              {sectionFailures.length > 0 && <Feedback tone="error">No se pudo guardar todo:
                <ul>{sectionFailures.map((f) => <li key={f.id}>{f.label}: {f.message}</li>)}</ul></Feedback>}
            </Card>;
          })}
          {proposal.unsupported.length > 0 && <Feedback tone="info">
            También propone: {proposal.unsupported.map((section) => `${section.label} (${section.count})`).join(', ')}. Eso todavía no se aplica desde la web y no se guardará.
          </Feedback>}
        </section>}
        {notice && <Feedback tone="success">{notice}</Feedback>}
      </Card>)}
  </main>;
}
