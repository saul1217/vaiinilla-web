// Caja › Alumnos sin teléfono (Doop C05 a C08): buscar al alumno por nombre, matrícula,
// credencial QR o tarjeta NFC; ver alergias y lo que puede gastar hoy; cobrar de su saldo
// (con PIN si su tutor lo puso); entregar lo de hoy y hacerle su credencial.
// Contrato: GET /alumnos, POST /alumnos/:id/compras y /alumnos/:id/credenciales.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Minus, Nfc, Plus, Printer, QrCode, Search } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { AppSheet } from '../components/app-sheet';
import { QrTokenField } from '../components/qr-token-field';
import { Button, Feedback, Field } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { formatMoney } from '../lib/money';
import { canWriteNfc, readNfcSerial } from '../lib/nfc-tag';
import {
  allergyBanner,
  blockReason,
  cartTotalCents,
  defaultChoices,
  firstName,
  fromCents,
  needsChoice,
  pinReady,
  purchaseItems,
  spendableCents,
  stepCart,
  studentIdentity,
  toggleChoice,
  type StudentCard,
  type StudentCredential,
  type StudentTodayOrder,
} from '../lib/student-counter';
import type { CatalogProduct } from '../types/api';

const money = (value: string) => formatMoney(fromCents(Math.round(Number(value) * 100)));

export function StudentCounterPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scope = tenant ? `${tenant.context.establecimiento_id}|${tenant.context.usuario_id}` : '';
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [credentialInput, setCredentialInput] = useState('');
  const [selected, setSelected] = useState<StudentCard | null>(null);
  // La credencial con que se encontró: sirve de QR para entregarle lo de hoy.
  const [scannedCredential, setScannedCredential] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [readingNfc, setReadingNfc] = useState(false);
  const nfcAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 240);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => () => nfcAbort.current?.abort(), []);

  const status = useQuery({
    queryKey: ['operational-status', 'alumnos', scope],
    enabled: Boolean(token),
    queryFn: () => api.operationalStatus(token),
    refetchInterval: 30_000,
  });
  const search = useQuery({
    queryKey: ['alumnos', scope, debounced],
    enabled: Boolean(token) && debounced.length >= 2,
    queryFn: ({ signal }) => api.searchStudents(token, debounced, signal),
  });

  const find = useMutation({
    mutationFn: (credential: string) => api.findStudentByCredential(token, credential),
    onSuccess: (found, credential) => {
      if (!found) return setLookupError('No encontramos ningún alumno con esa credencial.');
      setLookupError(null);
      setCredentialInput('');
      setScannedCredential(credential.trim());
      setSelected(found);
    },
    onError: (error) => setLookupError(errorMessage(error)),
  });

  const readCard = async () => {
    if (readingNfc) return nfcAbort.current?.abort();
    const controller = new AbortController();
    nfcAbort.current = controller;
    setReadingNfc(true);
    setLookupError(null);
    try {
      find.mutate(await readNfcSerial(controller.signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setLookupError(errorMessage(error));
    } finally {
      setReadingNfc(false);
    }
  };

  if (selected) {
    return (
      <StudentSale
        token={token}
        scope={scope}
        student={selected}
        scannedCredential={scannedCredential}
        cashOpen={status.data?.sesion_caja_abierta ?? true}
        requiresQr={status.data?.entrega_requiere_qr ?? true}
        onChange={setSelected}
        onBack={() => { setSelected(null); setScannedCredential(null); }}
      />
    );
  }

  const results = search.data ?? [];
  return (
    <main className="page-stack admin-screen student-counter">
      <AppPageHeader
        eyebrow="Caja"
        title="Alumnos"
        description="Sin teléfono: cobra con su saldo o búscalo con su credencial."
        action={<Link className="button button--ghost" to="/app/pos"><ArrowLeft aria-hidden="true" className="size-4" /> Caja</Link>}
      />
      {status.data && status.data.modo_escuela === false && (
        <Feedback tone="info">Este negocio no está en modo escuela: aquí solo aparecen alumnos dados de alta por su escuela.</Feedback>
      )}
      <section className="student-counter__find" aria-label="Buscar alumno">
        <Field
          name="student-search"
          label="Nombre o matrícula"
          placeholder="Por ejemplo: Lía o KAO-211"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <form
          className="student-counter__credential"
          onSubmit={(event) => {
            event.preventDefault();
            if (credentialInput.trim()) find.mutate(credentialInput);
          }}
        >
          <QrTokenField value={credentialInput} onChange={setCredentialInput} />
          <div className="form-actions">
            <Button type="submit" variant="secondary" loading={find.isPending && !readingNfc} disabled={!credentialInput.trim()}>
              <QrCode aria-hidden="true" className="size-4" /> Buscar por credencial
            </Button>
            {canWriteNfc() && (
              <Button type="button" variant="secondary" onClick={() => void readCard()} aria-pressed={readingNfc}>
                <Nfc aria-hidden="true" className="size-4" /> {readingNfc ? 'Acerca la tarjeta… (tocar para cancelar)' : 'Leer tarjeta NFC'}
              </Button>
            )}
          </div>
        </form>
        {lookupError && <Feedback tone="error">{lookupError}</Feedback>}
      </section>

      <section aria-label="Alumnos encontrados" aria-busy={search.isFetching} className="student-counter__results">
        {search.isError ? (
          <Feedback tone="error">{errorMessage(search.error)}</Feedback>
        ) : debounced.length < 2 ? (
          <p className="student-counter__hint"><Search aria-hidden="true" className="size-4" /> Escribe al menos 2 letras del nombre o la matrícula.</p>
        ) : search.isPending ? (
          <p className="student-counter__hint">Buscando…</p>
        ) : results.length === 0 ? (
          <p className="student-counter__hint">No hay ningún alumno con ese nombre o matrícula.</p>
        ) : (
          <ul className="student-counter__list">
            {results.map((student) => (
              <li key={student.usuario_id}>
                <button type="button" onClick={() => { setScannedCredential(null); setSelected(student); }}>
                  <strong>{student.nombre}</strong>
                  <small>{[studentIdentity(student), `Saldo ${money(student.saldo)}`].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StudentSale({
  token,
  scope,
  student,
  scannedCredential,
  cashOpen,
  requiresQr,
  onChange,
  onBack,
}: {
  token: string;
  scope: string;
  student: StudentCard;
  scannedCredential: string | null;
  cashOpen: boolean;
  requiresQr: boolean;
  onChange: (student: StudentCard) => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<Record<number, number>>({});
  const [choices, setChoices] = useState<Record<number, number[]>>({});
  const [choosing, setChoosing] = useState<{ product: CatalogProduct; picked: number[] } | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [credentialOpen, setCredentialOpen] = useState(false);
  // El mismo carrito reintentado reusa su llave: no se cobra dos veces si se perdió la respuesta.
  const purchaseKey = useRef<{ signature: string; key: string } | null>(null);

  const catalog = useQuery({
    queryKey: ['catalogo', scope],
    enabled: Boolean(token),
    queryFn: () => api.catalog(token),
    staleTime: 60_000,
  });
  const products = useMemo(() => (catalog.data?.productos ?? []).filter((product) => product.disponible), [catalog.data]);

  async function reload() {
    try {
      const list = await api.searchStudents(token, student.matricula?.trim() || student.nombre);
      const fresh = list.find((item) => item.usuario_id === student.usuario_id);
      if (fresh) onChange(fresh);
    } catch {
      // Se queda la tarjeta que ya se ve si la recarga falla.
    }
    await queryClient.invalidateQueries({ queryKey: ['alumnos'] });
  }

  const totalCents = cartTotalCents(cart, products, choices);
  const items = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const canSpend = spendableCents(student);
  const overBudget = totalCents > canSpend;
  const pinOk = pinReady(student, pin);
  const allergy = allergyBanner(student.alergenos);
  const first = firstName(student);

  const purchase = useMutation({
    mutationFn: () => {
      const body = purchaseItems(cart, choices);
      const signature = JSON.stringify(body);
      if (purchaseKey.current?.signature !== signature) purchaseKey.current = { signature, key: createIdempotencyKey() };
      return api.studentPurchase(token, student.usuario_id, body, student.pide_pin ? pin.trim() : null, purchaseKey.current.key);
    },
    onSuccess: async (order) => {
      purchaseKey.current = null;
      setCart({});
      setChoices({});
      setPin('');
      setMessage({ tone: 'success', text: `Pedido #${order.folio} a cocina.` });
      await reload();
    },
    onError: (error) => {
      setPin('');
      setMessage({ tone: 'error', text: errorMessage(error) });
    },
  });

  const deliver = useMutation({
    mutationFn: (order: StudentTodayOrder) => api.deliverStudentOrder(token, order.id, order.version, scannedCredential),
    onSuccess: async (order) => {
      setMessage({ tone: 'success', text: `Pedido #${order.folio} entregado.` });
      await reload();
    },
    onError: (error) => setMessage({ tone: 'error', text: errorMessage(error) }),
  });

  const add = (product: CatalogProduct) => {
    setMessage(null);
    if (needsChoice(product) && !(cart[product.id] ?? 0)) {
      setChoosing({ product, picked: choices[product.id] ?? defaultChoices(product) });
      return;
    }
    setCart((current) => stepCart(current, product.id, 1));
  };
  const remove = (product: CatalogProduct) => {
    setMessage(null);
    setCart((current) => stepCart(current, product.id, -1));
  };

  const footer = !cashOpen
    ? 'Abre la caja para cobrar.'
    : overBudget
      ? `Hoy solo puede gastar ${formatMoney(fromCents(canSpend))}.`
      : student.pide_pin && items > 0 && !pinOk
        ? 'Su tutor le puso PIN: pídeselo.'
        : null;

  return (
    <main className="page-stack admin-screen student-counter">
      <AppPageHeader
        eyebrow={studentIdentity(student) || 'Alumno'}
        title={student.nombre}
        action={
          <div className="form-actions">
            <Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden="true" className="size-4" /> Alumnos</Button>
            <Button variant="secondary" onClick={() => setCredentialOpen(true)}><QrCode aria-hidden="true" className="size-4" /> Credencial</Button>
          </div>
        }
      />
      {student.nota_tutor && <Feedback tone="info">Nota del tutor: {student.nota_tutor}</Feedback>}
      <section className="student-counter__budget" aria-label="Lo que puede gastar hoy">
        <span>Puede gastar hoy</span>
        <strong>{formatMoney(fromCents(canSpend))}</strong>
        <small>
          {[`Saldo ${money(student.saldo)}`, student.limite_diario != null ? `lleva ${money(student.gastado_hoy)} de ${money(student.limite_diario)} hoy` : null].filter(Boolean).join(' · ')}
        </small>
      </section>
      {allergy && (
        <p className="student-counter__allergy" role="note"><AlertTriangle aria-hidden="true" className="size-4" /> {allergy}</p>
      )}
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}

      {student.pedidos_hoy.length > 0 && (
        <section className="student-counter__today" aria-label="Pedidos de hoy">
          <h2 className="eyebrow">Hoy</h2>
          <ul>
            {student.pedidos_hoy.map((order) => {
              const ready = order.estado === 'listo';
              const needsScan = requiresQr && !scannedCredential;
              return (
                <li key={order.id}>
                  <div>
                    <strong>#{order.folio} · {order.estado}</strong>
                    {order.resumen && <small>{order.resumen}</small>}
                  </div>
                  {ready && !needsScan ? (
                    <Button loading={deliver.isPending && deliver.variables?.id === order.id} disabled={deliver.isPending} onClick={() => deliver.mutate(order)}>
                      Entregar
                    </Button>
                  ) : ready ? (
                    <small className="student-counter__hint">Para entregar, búscalo con su credencial.</small>
                  ) : (
                    <span>{money(order.total)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="student-counter__sell" aria-label="Vender">
        <h2 className="eyebrow">Vender</h2>
        {catalog.isError ? (
          <Feedback tone="error">{errorMessage(catalog.error)}</Feedback>
        ) : catalog.isPending ? (
          <p className="student-counter__hint">Cargando el menú…</p>
        ) : products.length === 0 ? (
          <p className="student-counter__hint">No hay productos disponibles para vender.</p>
        ) : (
          <ul className="student-counter__products">
            {products.map((product) => {
              const blocked = blockReason(product, student);
              const quantity = cart[product.id] ?? 0;
              return (
                <li key={product.id} data-blocked={Boolean(blocked)}>
                  <div>
                    <strong>{product.nombre}</strong>
                    <small>{money(product.precio_mostrador)}{blocked ? ` · ${blocked}` : ''}</small>
                  </div>
                  {blocked && quantity === 0 ? (
                    <small aria-label={`${product.nombre}: no disponible para este alumno`}>No disponible</small>
                  ) : (
                    <div className="student-counter__stepper">
                      {quantity > 0 && (
                        <Button variant="secondary" aria-label={`Quitar uno de ${product.nombre}`} onClick={() => remove(product)}><Minus aria-hidden="true" className="size-4" /></Button>
                      )}
                      {quantity > 0 && <span aria-live="polite">{quantity}</span>}
                      <Button variant="secondary" aria-label={quantity ? `Otro ${product.nombre}` : `Agregar ${product.nombre}`} disabled={Boolean(blocked)} onClick={() => add(product)}>
                        <Plus aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="student-counter__charge" aria-label="Cobrar">
        {footer && <p role="alert" className="student-counter__hint">{footer}</p>}
        {student.pide_pin && (
          <Field
            name="student-pin"
            label={`PIN de ${first}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            hint="Lo puso su tutor."
          />
        )}
        <Button
          loading={purchase.isPending}
          disabled={!cashOpen || items === 0 || overBudget || !pinOk || purchase.isPending}
          onClick={() => purchase.mutate()}
        >
          {items > 0 ? `Cobrar ${formatMoney(fromCents(totalCents))} de su saldo` : 'Cobrar de su saldo'}
        </Button>
      </section>

      <AppSheet
        open={Boolean(choosing)}
        onOpenChange={(open) => { if (!open) setChoosing(null); }}
        title={choosing?.product.nombre ?? 'Opciones'}
        description={choosing ? money(choosing.product.precio_mostrador) : undefined}
      >
        {choosing && (
          <div className="transaction-form">
            {choosing.product.grupos_opcion.map((group) => (
              <fieldset key={group.id} className="student-counter__options">
                <legend>{group.nombre}{group.min_selecciones > 0 ? ' · obligatorio' : ''}</legend>
                {group.opciones.map((option) => (
                  <label key={option.id}>
                    <input
                      type={group.max_selecciones === 1 ? 'radio' : 'checkbox'}
                      name={`grupo-${group.id}`}
                      checked={choosing.picked.includes(option.id)}
                      onChange={() => setChoosing({ ...choosing, picked: toggleChoice(choosing.product, choosing.picked, option.id) })}
                    />
                    <span>{option.nombre}</span>
                    {Number(option.precio_extra) > 0 && <small>+{money(option.precio_extra)}</small>}
                  </label>
                ))}
              </fieldset>
            ))}
            <Button
              onClick={() => {
                setChoices((current) => ({ ...current, [choosing.product.id]: choosing.picked }));
                setCart((current) => stepCart(current, choosing.product.id, 1));
                setChoosing(null);
              }}
            >
              Agregar {choosing.product.nombre}
            </Button>
          </div>
        )}
      </AppSheet>

      <CredentialSheet
        token={token}
        student={student}
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        onIssued={() => void reload()}
      />
    </main>
  );
}

function CredentialSheet({
  token,
  student,
  open,
  onOpenChange,
  onIssued,
}: {
  token: string;
  student: StudentCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [credential, setCredential] = useState<StudentCredential | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const first = firstName(student);

  useEffect(() => {
    if (!credential?.valor) return;
    let alive = true;
    void QRCode.toDataURL(credential.valor, { margin: 1, width: 420, errorCorrectionLevel: 'M' }).then((url) => { if (alive) setImage(url); });
    return () => { alive = false; };
  }, [credential]);
  useEffect(() => () => abort.current?.abort(), []);

  const issue = useMutation({
    mutationFn: ({ tipo, valor }: { tipo: 'qr' | 'nfc'; valor: string | null }) =>
      api.assignStudentCredential(token, student.usuario_id, tipo, valor, createIdempotencyKey()),
    onSuccess: (created) => {
      setConfirming(false);
      setError(null);
      setCredential(created);
      onIssued();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  const close = (next: boolean) => {
    if (!next) {
      abort.current?.abort();
      setConfirming(false);
      setCredential(null);
      setImage(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const linkNfc = async () => {
    if (linking) return abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLinking(true);
    setError(null);
    try {
      issue.mutate({ tipo: 'nfc', valor: await readNfcSerial(controller.signal) });
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(errorMessage(failure));
    } finally {
      setLinking(false);
    }
  };

  const print = () => {
    if (!image) return;
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return setError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
    const doc = win.document;
    doc.title = `Credencial de ${student.nombre}`;
    const name = doc.createElement('h1');
    name.textContent = student.nombre;
    name.style.cssText = 'font:700 20px system-ui;text-align:center;margin:16px 0 4px';
    const sub = doc.createElement('p');
    sub.textContent = studentIdentity(student);
    sub.style.cssText = 'font:14px system-ui;text-align:center;margin:0 0 12px;color:#555';
    const img = doc.createElement('img');
    img.src = image;
    img.alt = `Credencial de ${student.nombre}`;
    img.style.cssText = 'display:block;width:260px;margin:0 auto';
    doc.body.append(name, sub, img);
    img.onload = () => win.print();
  };

  return (
    <AppSheet open={open} onOpenChange={close} title={`Credencial de ${first}`} description="Con su credencial, Caja lo encuentra al escanearla o al acercar su tarjeta.">
      <div className="transaction-form">
        {error && <Feedback tone="error">{error}</Feedback>}
        {credential?.tipo === 'qr' && credential.valor ? (
          <>
            {image && <img className="student-counter__qr" src={image} alt={`Credencial de ${student.nombre}`} />}
            <p className="student-counter__hint">Imprímela o tómale foto ahora: este código no se vuelve a mostrar.</p>
            <div className="form-actions">
              <Button variant="secondary" disabled={!image} onClick={print}><Printer aria-hidden="true" className="size-4" /> Imprimir</Button>
              <Button onClick={() => close(false)}>Listo</Button>
            </div>
          </>
        ) : credential?.tipo === 'nfc' ? (
          <>
            <Feedback tone="success">Tarjeta NFC ligada a {first}.</Feedback>
            <Button onClick={() => close(false)}>Listo</Button>
          </>
        ) : confirming ? (
          <>
            <p>Si {student.nombre} ya tenía una, deja de servir.</p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setConfirming(false)}>No</Button>
              <Button loading={issue.isPending} onClick={() => issue.mutate({ tipo: 'qr', valor: null })}>Hacer credencial</Button>
            </div>
          </>
        ) : (
          <div className="form-actions">
            <Button onClick={() => { setError(null); setConfirming(true); }}><QrCode aria-hidden="true" className="size-4" /> Hacer credencial QR</Button>
            {canWriteNfc() && (
              <Button variant="secondary" loading={issue.isPending && issue.variables?.tipo === 'nfc'} aria-pressed={linking} onClick={() => void linkNfc()}>
                <Nfc aria-hidden="true" className="size-4" /> {linking ? 'Acerca la tarjeta… (tocar para cancelar)' : 'Ligar una tarjeta NFC'}
              </Button>
            )}
          </div>
        )}
      </div>
    </AppSheet>
  );
}
