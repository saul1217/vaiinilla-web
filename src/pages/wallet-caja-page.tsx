import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, QrCode, Search, WalletCards } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { AppSheet } from '../components/app-sheet';
import { Feedback, Field, Modal } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';

const QrTokenField = lazy(() => import('../components/qr-token-field').then((m) => ({ default: m.QrTokenField })));
import { useSessions } from '../context/session-context';
import { api, apiUrl } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { centsToMoney, formatMoney, moneyToCents } from '../lib/money';
import {
  MAX_CASH_RECHARGE,
  QUICK_AMOUNTS,
  WALLET_SEARCH_DEBOUNCE_MS,
  WALLET_SEARCH_MIN,
  canRecharge,
  clearPendingRecharge,
  clientDetail,
  exceedsCashRechargeMax,
  isDebit,
  keepPendingAfter,
  movementAmountLabel,
  movementDate,
  movementDetail,
  parseWalletUserQr,
  readPendingRecharge,
  rechargeAmount,
  rechargeErrorMessage,
  rechargeLabel,
  searchQuery,
  walletKeys,
  writePendingRecharge,
  type PendingRecharge,
  type PendingRechargeScope,
} from '../lib/wallet-caja';
import type { WalletCashRecharge, WalletClient } from '../types/api';

const MOVEMENTS_PAGE = 20;

/** Lo mínimo para identificar a quién se le recarga: viene de la búsqueda o del registro pendiente. */
interface SelectedClient {
  userId: string;
  name: string;
}

export function WalletCajaPage() {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const { establecimiento_id: storeId, usuario_id: userId, membresia_id: membershipId, rol } = tenant.context;
  // Remontar al cambiar de negocio o membresía descarta la búsqueda y el cliente de la sesión anterior.
  return <WalletCajaScreen key={`${storeId}:${membershipId}`} token={tenant.token} role={rol}
    scope={{ apiUrl, establecimientoId: storeId, usuarioId: userId, membresiaId: membershipId }} />;
}

function WalletCajaScreen({ token, role, scope }: { token: string; role: string; scope: PendingRechargeScope }) {
  const storeId = scope.establecimientoId;
  const keys = walletKeys(storeId);
  const queryClient = useQueryClient();
  const cashier = canRecharge(role);

  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedClient | null>(null);
  const [pending, setPending] = useState<PendingRecharge | null>(() => (cashier ? readPendingRecharge(scope) : null));
  // El nombre del cliente solo vive en memoria: la recarga guardada en el navegador lleva su id, no datos personales.
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<(WalletCashRecharge & { name: string }) | null>(null);
  const [rechargeError, setRechargeError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);

  const openFromQr = (raw: string) => {
    const userId = parseWalletUserQr(raw);
    if (!userId) {
      setQrError('Ese código no parece una tarjeta o QR de cliente de Vaiinilla.');
      return false;
    }
    setQrError(null);
    setQrInput('');
    setQrOpen(false);
    setText('');
    setSelected({ userId, name: 'Cliente' });
    setReceipt(null);
    setRechargeError(null);
    return true;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchQuery(text)), WALLET_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const search = useQuery({
    queryKey: keys.search(query ?? ''),
    enabled: Boolean(token && query),
    queryFn: ({ signal }) => api.searchWalletClients(token, query!, signal),
  });

  // Solo para avisar antes de cobrar: el servidor vuelve a revisar que Caja esté abierta.
  const cashSession = useQuery({
    queryKey: ['cash-session', storeId],
    enabled: cashier && Boolean(token),
    queryFn: () => api.activeCashSession(token),
  });
  const cashClosed = cashier && cashSession.isSuccess && !cashSession.data;

  const sending = useRef(false);
  const recharge = useMutation({
    mutationFn: async ({ record }: { record: PendingRecharge; name: string | null }) => {
      // Se guarda antes de mandar: si la pestaña se cierra a medias, al volver sale como pendiente.
      writePendingRecharge(scope, record);
      return api.rechargeWalletCash(token, record.userId, record.amount, record.idempotencyKey);
    },
    onSuccess: (result, { name }) => {
      clearPendingRecharge(scope);
      setPending(null);
      setPendingName(null);
      setRechargeError(null);
      setReceipt({ ...result, name: name ?? 'el cliente' });
      void queryClient.invalidateQueries({ queryKey: keys.all });
    },
    onError: (error, { record, name }) => {
      if (keepPendingAfter(error)) {
        setPending(record);
        setPendingName(name);
      } else {
        clearPendingRecharge(scope);
        setPending(null);
        setPendingName(null);
      }
      setRechargeError(rechargeErrorMessage(error));
    },
    onSettled: () => { sending.current = false; },
  });

  const send = (record: PendingRecharge, name: string | null) => {
    if (sending.current) return;
    sending.current = true;
    setReceipt(null);
    setRechargeError(null);
    recharge.mutate({ record, name });
  };

  const discardPending = () => {
    clearPendingRecharge(scope);
    setPending(null);
    setPendingName(null);
    setRechargeError(null);
    if (pending) void queryClient.invalidateQueries({ queryKey: keys.detail(pending.userId) });
  };

  const choose = (client: WalletClient) => {
    setSelected({ userId: client.usuario_id, name: client.nombre });
    setReceipt(null);
    setRechargeError(null);
  };

  const trimmed = text.trim();
  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow={cashier ? 'Caja · Saldo' : 'Administración · Saldo'} title="Saldo de clientes"
      description={cashier
        ? 'Busca al cliente, revisa su saldo y recárgale en efectivo.'
        : 'Busca al cliente y consulta su saldo y movimientos. Las recargas se hacen desde Caja.'} />

    {pending && <Feedback tone="info">
      <p className="font-semibold">Recarga sin confirmar: {formatMoney(pending.amount)} para {pendingName ?? 'un cliente'}.</p>
      <p>No sabemos si entró. Reintenta con el mismo botón: si ya se había abonado, no se cobra dos veces.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <VaiButton variant="accent" loading={recharge.isPending} onClick={() => send(pending, pendingName)}>Reintentar recarga</VaiButton>
        <VaiButton variant="secondary" disabled={recharge.isPending}
          onClick={() => { setSelected({ userId: pending.userId, name: pendingName ?? 'Cliente' }); }}>Ver su saldo</VaiButton>
        <VaiButton variant="quiet" disabled={recharge.isPending} onClick={discardPending}>Descartar</VaiButton>
      </div>
    </Feedback>}

    {rechargeError && <Feedback tone="error">{rechargeError}</Feedback>}

    {receipt && <Feedback tone="success">
      Recarga de {formatMoney(receipt.recarga)} para {receipt.name}. Saldo nuevo: <strong>{formatMoney(receipt.saldo_nuevo)}</strong> (antes {formatMoney(receipt.saldo_anterior)}).
    </Feedback>}

    {cashClosed && <Feedback tone="info">Caja está cerrada. Ábrela desde Caja para poder recargar saldo.</Feedback>}

    <Card title="Buscar cliente">
      <div className="mb-3 flex flex-wrap gap-2">
        <VaiButton variant="secondary" onClick={() => { setQrError(null); setQrInput(''); setQrOpen(true); }}>
          <QrCode aria-hidden="true" className="size-4" /> Escanear QR del cliente
        </VaiButton>
      </div>
      <Field label="Nombre o identificador" type="search" autoComplete="off" maxLength={160} value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (parseWalletUserQr(next)) {
            openFromQr(next);
            return;
          }
          setText(next);
        }}
        hint={`Escribe al menos ${WALLET_SEARCH_MIN} letras o escanea la tarjeta QR con pistola/cámara.`} />
      <SearchResults text={trimmed} query={query} loading={search.isFetching && !search.data} error={search.error}
        clients={search.data} selectedId={selected?.userId ?? null} onChoose={choose} onRetry={() => void search.refetch()} />
    </Card>

    <AppSheet open={qrOpen} onOpenChange={setQrOpen} title="Escanear QR del cliente"
      description="Apunta la cámara a la tarjeta QR del cliente o pásala por la pistola lectora.">
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); openFromQr(qrInput); }}>
        <Suspense fallback={<LoadingState label="Abriendo lector QR…" />}>
          <QrTokenField
            value={qrInput}
            autoFocus
            error={qrError ?? undefined}
            onChange={(value) => {
              setQrInput(value);
              setQrError(null);
              if (parseWalletUserQr(value)) openFromQr(value);
            }}
          />
        </Suspense>
        <VaiButton type="submit" variant="accent" block disabled={!qrInput.trim()}>Abrir saldo del cliente</VaiButton>
      </form>
    </AppSheet>

    {selected && <ClientWallet key={selected.userId} token={token} storeId={storeId} client={selected}
      cashier={cashier} blocked={cashClosed ? 'Caja está cerrada.' : pending ? 'Primero resuelve la recarga sin confirmar.' : null}
      sending={recharge.isPending} onRecharge={(amount, name) => send({
        version: 1,
        userId: selected.userId,
        amount,
        idempotencyKey: createIdempotencyKey(),
        createdAt: Date.now(),
      }, name)} />}
  </main>;
}

function SearchResults({ text, query, loading, error, clients, selectedId, onChoose, onRetry }: {
  text: string;
  query: string | null;
  loading: boolean;
  error: unknown;
  clients: WalletClient[] | undefined;
  selectedId: string | null;
  onChoose: (client: WalletClient) => void;
  onRetry: () => void;
}) {
  if (!query || text !== query) {
    return null;
  }
  if (loading) return <p className="mt-3" role="status">Buscando…</p>;
  if (error) {
    return <div className="mt-3"><Feedback tone="error">
      No se pudo buscar: {errorMessage(error)}{' '}
      <VaiButton variant="secondary" onClick={onRetry}>Reintentar</VaiButton>
    </Feedback></div>;
  }
  if (!clients || clients.length === 0) {
    return <div className="mt-3"><VaiEmptyState icon={<Search />} title="Sin resultados"
      message="No hay clientes de este negocio con ese nombre o identificador." /></div>;
  }
  return <ul className="mt-3 grid gap-2" aria-label="Clientes encontrados">
    {clients.map((client) => {
      const detail = clientDetail(client);
      return <li key={client.usuario_id}>
        <button type="button" className="vai-card flex w-full items-center justify-between gap-3 text-left"
          aria-pressed={client.usuario_id === selectedId} onClick={() => onChoose(client)}>
          <span className="grid gap-1">
            <span className="font-semibold">{client.nombre}</span>
            {detail && <small>{detail}</small>}
          </span>
          <span className="text-right"><small>Saldo</small><br /><strong>{formatMoney(client.saldo)}</strong></span>
        </button>
      </li>;
    })}
  </ul>;
}

function ClientWallet({ token, storeId, client, cashier, blocked, sending, onRecharge }: {
  token: string;
  storeId: string;
  client: SelectedClient;
  cashier: boolean;
  blocked: string | null;
  sending: boolean;
  onRecharge: (amount: string, name: string) => void;
}) {
  const detail = useInfiniteQuery({
    queryKey: walletKeys(storeId).detail(client.userId),
    enabled: Boolean(token),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.walletClientDetail(token, client.userId, { limit: MOVEMENTS_PAGE, cursor: pageParam }),
    getNextPageParam: (last) => last.cursor ?? undefined,
  });

  if (detail.isLoading) return <LoadingState label="Cargando el saldo del cliente…" cards={2} />;
  if (detail.isError || !detail.data) {
    const notFound = detail.error instanceof VaiinillaApiError && detail.error.status === 404;
    return <Feedback tone="error">
      {notFound ? 'Ese cliente ya no está disponible en este negocio.' : `No se pudo cargar el saldo: ${errorMessage(detail.error)}`}{' '}
      {!notFound && <VaiButton variant="secondary" onClick={() => void detail.refetch()}>Reintentar</VaiButton>}
    </Feedback>;
  }

  const first = detail.data.pages[0]!.data;
  const movements = detail.data.pages.flatMap((page) => page.data.movimientos);
  const name = first.cliente.nombre || client.name;
  const frozen = first.wallet.saldo_congelado;

  return <>
    <section className="analytics-kpi-grid" aria-label={`Saldo de ${name}`}>
      <article className="analytics-kpi">
        <span className="analytics-kpi__icon"><WalletCards aria-hidden="true" /></span>
        <p>{name}{first.cliente.identificador_cliente ? ` · ${first.cliente.identificador_cliente}` : ''}</p>
        <strong>{formatMoney(first.wallet.saldo)}</strong>
        <small>Saldo disponible</small>
      </article>
    </section>

    {frozen && <Feedback tone="info">Este negocio tiene apagado «Pagar con saldo»: el saldo se conserva, pero no se puede gastar ni recargar.</Feedback>}

    {cashier && !frozen && <RechargeForm name={name} balance={first.wallet.saldo} blocked={blocked} sending={sending}
      onConfirm={(amount) => onRecharge(amount, name)} />}
    {!cashier && <AdminAdjustForm token={token} userId={client.userId} name={name} balance={first.wallet.saldo}
      onAdjusted={() => void detail.refetch()} />}

    <Card title="Movimientos">
      {movements.length === 0
        ? <VaiEmptyState icon={<HandCoins />} title="Sin movimientos" message="Este cliente todavía no tiene movimientos de saldo en este negocio." />
        : <ul className="grid gap-2" aria-label={`Movimientos de ${name}`}>
          {movements.map((movement) => {
            const info = movementDetail(movement);
            return <li key={movement.id} className="flex items-start justify-between gap-3 py-2">
              <span className="grid gap-1">
                <span className="font-semibold">{movement.descripcion}</span>
                {info && <small>{info}</small>}
                <small><time dateTime={movement.creado_en}>{movementDate(movement.creado_en)}</time></small>
              </span>
              <span className="text-right">
                <strong className={isDebit(movement) ? undefined : 'font-black'}>{movementAmountLabel(movement.monto)}</strong><br />
                <small>Saldo {formatMoney(movement.saldo_posterior)}</small>
              </span>
            </li>;
          })}
        </ul>}
      {detail.hasNextPage && <div className="mt-3">
        <VaiButton variant="secondary" loading={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()}>Ver más movimientos</VaiButton>
      </div>}
    </Card>
  </>;
}

function RechargeForm({ name, balance, blocked, sending, onConfirm }: {
  name: string;
  balance: string;
  blocked: string | null;
  sending: boolean;
  onConfirm: (amount: string) => void;
}) {
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const parsed = rechargeAmount(text);
  const overMax = parsed !== null && exceedsCashRechargeMax(parsed);
  const amount = overMax ? null : parsed;
  const invalid = text.trim() !== '' && parsed === null;
  const balanceCents = moneyToCents(balance);
  const after = amount && balanceCents !== null ? centsToMoney(balanceCents + moneyToCents(amount)!) : null;

  return <Card title="Recargar en efectivo" description={`Cobra el efectivo a ${name} y abónalo a su saldo.`}>
    <Field label="Monto" inputMode="decimal" autoComplete="off" placeholder="0.00" value={text} onChange={(event) => setText(event.target.value)}
      error={invalid
        ? 'Escribe un monto mayor a 0, con hasta 2 decimales.'
        : overMax ? `El máximo por recarga en efectivo es ${formatMoney(MAX_CASH_RECHARGE)}.` : undefined}
      hint={blocked ?? 'Escribe cualquier monto o elige un atajo rápido.'} />
    <div className="mt-3">
      <ChipRow label="Montos rápidos">
        {QUICK_AMOUNTS.map((value) => <Chip key={value} selected={amount === `${value}.00`} onClick={() => setText(value)}>
          ${value}
        </Chip>)}
      </ChipRow>
    </div>
    <div className="mt-3">
      <VaiButton variant="accent" block disabled={!amount || Boolean(blocked) || sending} loading={sending}
        onClick={() => setConfirming(true)}>{rechargeLabel(amount)}</VaiButton>
    </div>
    <Modal open={confirming && Boolean(amount)} onOpenChange={setConfirming} title="Confirmar recarga"
      description={amount ? `¿Recibiste ${formatMoney(amount)} en efectivo de ${name}?` : undefined}>
      {after && <p>Saldo actual {formatMoney(balance)}. Después de recargar: <strong>{formatMoney(after)}</strong>.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <VaiButton variant="secondary" onClick={() => setConfirming(false)}>Cancelar</VaiButton>
        <VaiButton variant="accent" onClick={() => {
          if (!amount) return;
          setConfirming(false);
          setText('');
          onConfirm(amount);
        }}>Sí, recargar {formatMoney(amount ?? '0.00')}</VaiButton>
      </div>
    </Modal>
  </Card>;
}

function parseSignedAmount(raw: string): string | null {
  const clean = raw.trim().replace(',', '.');
  if (!/^[+-]?\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  const sign = clean.startsWith('-') ? '-' : '';
  const body = clean.replace(/^[+-]/, '');
  const [pesos = '0', cents = ''] = body.split('.');
  const value = Number(`${pesos}.${cents.padEnd(2, '0')}`);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${sign}${BigInt(pesos)}.${cents.padEnd(2, '0')}`;
}

function AdminAdjustForm({ token, userId, name, balance, onAdjusted }: {
  token: string;
  userId: string;
  name: string;
  balance: string;
  onAdjusted: () => void;
}) {
  const [amountText, setAmountText] = useState('');
  const [bucket, setBucket] = useState<'pagada' | 'pendiente'>('pendiente');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const parsed = parseSignedAmount(amountText);
  const invalidAmount = amountText.trim() !== '' && parsed === null;
  const trimmedReason = reason.trim();
  const canSubmit = Boolean(parsed && trimmedReason.length >= 1 && trimmedReason.length <= 240);

  const adjust = useMutation({
    mutationFn: () => api.adjustWallet(token, userId, { monto: parsed!, bucket, motivo: trimmedReason }, createIdempotencyKey()),
    onSuccess: (res) => {
      setDoneMessage(`Ajuste aplicado. Nuevo saldo de ${name}: ${formatMoney(res.saldo_nuevo)}.`);
      setAmountText('');
      setReason('');
      onAdjusted();
    },
  });

  return <Card title="Ajuste manual de saldo (Administración)" description="Solo Caja recarga en efectivo. Como Administración puedes aplicar un ajuste auditado (+ o -) con motivo.">
    {doneMessage && <div className="mb-3"><Feedback tone="success">{doneMessage}</Feedback></div>}
    {adjust.isError && <div className="mb-3"><Feedback tone="error">{errorMessage(adjust.error)}</Feedback></div>}
    <div className="grid gap-3">
      <Field label="Monto del ajuste (+ o -)" inputMode="decimal" autoComplete="off" placeholder="Ej. 50.00 o -20.00"
        value={amountText} onChange={(event) => { setDoneMessage(null); setAmountText(event.target.value); }}
        error={invalidAmount ? 'Escribe un monto distinto de cero (ej. 50.00 o -20.00).' : undefined} />
      <ChipRow label="Tipo de saldo (bucket)">
        <Chip selected={bucket === 'pendiente'} onClick={() => setBucket('pendiente')}>Pendiente (efectivo)</Chip>
        <Chip selected={bucket === 'pagada'} onClick={() => setBucket('pagada')}>Pagada (tarjeta)</Chip>
      </ChipRow>
      <Field label="Motivo del ajuste" placeholder="Ej. Corrección por cobro duplicado" maxLength={240}
        value={reason} onChange={(event) => setReason(event.target.value)} />
      <VaiButton variant="accent" block disabled={!canSubmit || adjust.isPending} loading={adjust.isPending}
        onClick={() => setConfirming(true)}>Aplicar ajuste</VaiButton>
    </div>
    <Modal open={confirming && canSubmit} onOpenChange={setConfirming} title="Confirmar ajuste de saldo"
      description={`¿Aplicar un ajuste de ${parsed ?? ''} a ${name} (saldo actual ${formatMoney(balance)})?`}>
      <p>Motivo: <strong>{trimmedReason}</strong></p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <VaiButton variant="secondary" onClick={() => setConfirming(false)}>Cancelar</VaiButton>
        <VaiButton variant="accent" onClick={() => { setConfirming(false); adjust.mutate(); }}>Confirmar ajuste</VaiButton>
      </div>
    </Modal>
  </Card>;
}
