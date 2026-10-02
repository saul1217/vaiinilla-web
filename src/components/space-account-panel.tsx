// La cuenta de un espacio en el tablero del personal: lo que va pedido, cobrarla (toda o
// dividida, en efectivo o con la terminal), imprimirla y liberar el espacio. En una cancha
// con precio, además rentar o renovar en mostrador cobrando en efectivo (la renta se paga
// primero). Contrato: GET/POST /espacios/:id/sesion*, POST /reservas y /reservas/:id/pago.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, CreditCard, Printer, ReceiptText, Unlock, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccountAbonoForm } from './account-abono-form';
import { PendingRefunds } from './pending-refunds';
import { RollingMoney } from './rolling-money';
import { TipPicker } from './tip-picker';
import { Button, Feedback, Field, Modal } from './ui';
import { api } from '../lib/api';
import { claimAliases } from '../lib/account-split';
import { addMoney, tipAmount, type TipChoice } from '../lib/tips';
import { errorMessage } from '../lib/api-error';
import { calculateChange, centsToMoney, formatMoney } from '../lib/money';
import { clock, spaceStatusLine } from '../lib/space-status';
import type {
  AccountPaymentMethod,
  CounterRental,
  SpaceAccountOrder,
  SpaceAvailability,
  SpaceSessionDetail,
} from '../types/api';

const RENTAL_DURATIONS = [60, 90, 120];
const MONEY_PATTERN = /^\d+\.\d{2}$/;

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const toCents = (amount: number) => BigInt(Math.round(amount * 100));

function printAccount(detail: SpaceSessionDetail): boolean {
  const account = detail.cuenta;
  if (!account) return false;
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) return false;
  const escape = (text: string) =>
    text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  const rows = account.pedidos
    .map(
      (order) => `<tr><td>#${order.folio} ${escape(order.items_resumen)}</td><td class="r">$${order.total.toFixed(2)}</td></tr>`,
    )
    .join('');
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta ${escape(detail.espacio.nombre)}</title>
<style>body{font:14px/1.4 ui-monospace,monospace;margin:16px;color:#111}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px}
table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top;border-bottom:1px dashed #999}.r{text-align:right;white-space:nowrap;padding-left:8px}
tfoot td{border:0;font-weight:700;padding-top:8px}</style></head><body>
<h1>${escape(detail.espacio.nombre)}</h1><p>${new Date().toLocaleString('es-MX')}</p>
<table><tbody>${rows}</tbody><tfoot>
<tr><td>Total</td><td class="r">$${account.total.toFixed(2)}</td></tr>
<tr><td>Pagado</td><td class="r">$${account.pagado.toFixed(2)}</td></tr>
<tr><td>Por pagar</td><td class="r">$${account.pendiente.toFixed(2)}</td></tr></tfoot></table>
<script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
  return true;
}

export function SpaceAccountPanel({
  token,
  spaceId,
  availability,
  canConfirmRefunds = false,
}: {
  token: string;
  spaceId: number;
  availability: SpaceAvailability | undefined;
  /** Caja confirma devoluciones; el mesero solo las ve. */
  canConfirmRefunds?: boolean;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [collecting, setCollecting] = useState(false);
  // Cómo se divide: por pedidos completos, por un monto o en partes iguales.
  const [chargeMode, setChargeMode] = useState<'pedidos' | 'monto' | 'partes'>('pedidos');
  const [method, setMethod] = useState<AccountPaymentMethod>('efectivo');
  const [selected, setSelected] = useState<string[]>([]);
  const [received, setReceived] = useState('');
  const [tip, setTip] = useState<TipChoice>({ kind: 'none' });
  const [rental, setRental] = useState<CounterRental | null>(null);
  const [rentalReceived, setRentalReceived] = useState('');

  const detail = useQuery({
    queryKey: ['space-session', spaceId],
    enabled: Boolean(token),
    queryFn: () => api.spaceSession(token, spaceId),
    refetchInterval: 5_000,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['space-session', spaceId] }),
      queryClient.invalidateQueries({ queryKey: ['space-availability'] }),
      queryClient.invalidateQueries({ queryKey: ['mesero-board'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-refunds'] }),
    ]);
  }

  const account = detail.data?.cuenta ?? null;
  const pending = useMemo(() => account?.pedidos.filter((order) => order.pendiente_cobro) ?? [], [account]);
  const selectedOrders = pending.filter((order) => selected.includes(order.id));
  const chargeCents = selectedOrders.reduce((sum, order) => sum + toCents(order.total), 0n);
  const charge = centsToMoney(chargeCents);
  const splitting = selectedOrders.length > 0 && selectedOrders.length < pending.length;
  const tipValue = tipAmount(charge, tip);
  const toCollect = addMoney(charge, tipValue);
  const change = method === 'efectivo' && MONEY_PATTERN.test(received) ? calculateChange(received, toCollect) : null;
  const canConfirmCharge = selectedOrders.length > 0 && (method === 'terminal' || change !== null);
  const abonado = account?.abonado ?? 0;
  const restante = centsToMoney(toCents(account?.restante ?? account?.pendiente ?? 0));
  const aliases = claimAliases(pending);

  const collect = useMutation({
    mutationFn: () =>
      api.collectSpaceAccount(token, spaceId, {
        metodo: method,
        montoRecibido: method === 'efectivo' ? received : undefined,
        totalEsperado: charge,
        pedidoIds: splitting ? selectedOrders.map((order) => order.id) : undefined,
        propina: tipValue,
      }),
    onSuccess: async (result) => {
      setCollecting(false);
      const changeText = result.metodo_pago === 'efectivo' && result.cambio !== '0.00' ? ` Cambio: ${formatMoney(result.cambio)}.` : '';
      const restText = result.restante !== '0.00' ? ` Falta por cobrar ${formatMoney(result.restante)}.` : ' Cuenta saldada.';
      setNotice({ tone: 'success', text: `Cobrado ${formatMoney(result.total)}${result.metodo_pago === 'terminal' ? ' con la terminal' : ''}.${changeText}${restText}` });
      await refresh();
    },
    // La cuenta pudo cambiar (alguien pidió algo más): se recarga y se avisa por qué.
    onError: async () => refresh(),
  });

  const release = useMutation({
    mutationFn: () => api.releaseSpace(token, spaceId, detail.data?.sesion?.version),
    onSuccess: async () => {
      setNotice({ tone: 'success', text: 'Espacio liberado.' });
      await refresh();
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error) }),
  });

  const startRental = useMutation({
    mutationFn: ({ minutes, renew }: { minutes: number; renew: boolean }) =>
      api.startCounterRental(token, {
        espacioId: spaceId,
        duracionMin: minutes,
        inicio: renew ? detail.data?.fin_previsto ?? availability?.fin_previsto ?? null : null,
      }),
    onSuccess: (created) => {
      setRentalReceived('');
      setRental(created);
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error) }),
  });

  const payRental = useMutation({
    mutationFn: () => api.payCounterRental(token, rental!.id, rentalReceived),
    onSuccess: async (result) => {
      setRental(null);
      const changeText = result.cobro && result.cobro.cambio !== '0.00' ? ` Cambio: ${formatMoney(result.cobro.cambio)}.` : '';
      setNotice({ tone: 'success', text: `Cancha rentada hasta ${clock(result.reserva.fin)}.${changeText}` });
      await refresh();
    },
  });

  function closeRental() {
    const pendingRental = rental;
    setRental(null);
    payRental.reset();
    // No se cobró: se suelta el horario apartado para que otro lo pueda tomar.
    if (pendingRental) void api.cancelCounterRental(token, pendingRental.id).catch(() => undefined);
  }

  function beginCollect() {
    collect.reset();
    // Con abonos en curso ya no se cobra por pedidos: se sigue por monto.
    setChargeMode(abonado > 0 ? 'monto' : 'pedidos');
    setMethod('efectivo');
    setReceived('');
    setTip({ kind: 'none' });
    setSelected(pending.map((order) => order.id));
    setCollecting(true);
  }

  function toggle(order: SpaceAccountOrder) {
    setSelected((current) =>
      current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id],
    );
  }

  const isRentalCourt = availability?.espacio.tipo === 'cancha' && availability.precio_hora !== null;
  const occupied = detail.data?.estado === 'ocupada' || detail.data?.estado === 'en_gracia';
  const rentalChange = rental && MONEY_PATTERN.test(rentalReceived) ? calculateChange(rentalReceived, rental.monto) : null;

  if (detail.isPending) return <p className="space-account__hint">Cargando la cuenta…</p>;
  if (detail.isError) return <Feedback tone="error">{errorMessage(detail.error)}</Feedback>;
  const data = detail.data;

  return (
    <section className="space-account" aria-label={`Cuenta de ${data.espacio.nombre}`}>
      <div className="space-account__status">
        <Clock3 aria-hidden="true" className="size-5" />
        <span>
          {spaceStatusLine({
            estado: data.estado,
            fin_previsto: data.fin_previsto,
            proxima_reserva: availability?.proxima_reserva ?? null,
          })}
          {isRentalCourt && availability?.precio_hora ? ` · ${formatMoney(availability.precio_hora)} / hora` : ''}
        </span>
      </div>

      {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
      <PendingRefunds token={token} spaceId={spaceId} canConfirm={canConfirmRefunds} />

      {isRentalCourt && (
        <div className="space-account__rent">
          <p className="eyebrow">{occupied ? 'Renovar el turno' : 'Rentar ahora'}</p>
          <div className="space-account__chips">
            {RENTAL_DURATIONS.map((minutes) => (
              <Button
                key={minutes}
                variant="secondary"
                loading={startRental.isPending && startRental.variables?.minutes === minutes}
                disabled={startRental.isPending}
                onClick={() => startRental.mutate({ minutes, renew: occupied })}
              >
                {occupied ? '+' : ''}{durationLabel(minutes)}
              </Button>
            ))}
          </div>
          <p className="space-account__hint">La renta se cobra primero, en efectivo.</p>
        </div>
      )}

      {account && account.pedidos.length > 0 && (
        <div className="space-account__bill">
          <div className="space-account__head">
            <strong>Cuenta</strong>
            <span>{account.pedidos.length} {account.pedidos.length === 1 ? 'pedido' : 'pedidos'}</span>
          </div>
          <ul className="space-account__orders">
            {account.pedidos.map((order) => (
              <li key={order.id}>
                <div>
                  <strong>#{order.folio} · {order.cliente?.nombre ?? 'Cliente'}</strong>
                  <p>{order.items_resumen}</p>
                </div>
                <div className="space-account__order-side">
                  <strong>{formatMoney(order.total.toFixed(2))}</strong>
                  <span className={order.pendiente_cobro ? 'space-account__chip space-account__chip--due' : 'space-account__chip'}>
                    {order.pendiente_cobro ? 'sin cobrar' : 'cobrado'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-account__totals">
            <span>Cuenta <strong><RollingMoney value={centsToMoney(toCents(account.total))} /></strong></span>
            <span>Por cobrar <strong><RollingMoney value={centsToMoney(toCents(account.pendiente))} /></strong></span>
            {abonado > 0 && (
              <>
                <span>Abonado <strong><RollingMoney value={centsToMoney(toCents(abonado))} /></strong></span>
                <span>Falta <strong><RollingMoney value={restante} /></strong></span>
              </>
            )}
          </div>
          <div className="form-actions">
            {pending.length > 0 && (
              <Button variant="dark" onClick={beginCollect}>
                <Wallet aria-hidden="true" className="size-5" /> Cobrar cuenta
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                if (!printAccount(data)) setNotice({ tone: 'error', text: 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.' });
              }}
            >
              <Printer aria-hidden="true" className="size-5" /> Imprimir cuenta
            </Button>
          </div>
        </div>
      )}

      {data.sesion && (account?.saldada ?? true) && (
        <Button variant="ghost" loading={release.isPending} onClick={() => release.mutate()}>
          <Unlock aria-hidden="true" className="size-5" /> Liberar espacio
        </Button>
      )}

      <Modal
        open={collecting}
        onOpenChange={(next) => { if (!next) setCollecting(false); }}
        title={`Cobrar ${data.espacio.nombre}`}
        description="Divide por pedidos, por un monto o en partes iguales."
      >
        <div className="charge-mode" role="radiogroup" aria-label="Cómo dividir" data-mode={chargeMode}>
          <span className="charge-mode__indicator" aria-hidden="true" />
          <button
            type="button"
            role="radio"
            aria-checked={chargeMode === 'pedidos'}
            disabled={abonado > 0}
            onClick={() => setChargeMode('pedidos')}
          >
            Por pedidos
          </button>
          <button type="button" role="radio" aria-checked={chargeMode === 'monto'} onClick={() => setChargeMode('monto')}>
            Por monto
          </button>
          <button type="button" role="radio" aria-checked={chargeMode === 'partes'} onClick={() => setChargeMode('partes')}>
            Partes iguales
          </button>
        </div>
        {abonado > 0 && (
          <p className="space-account__hint">Ya se abonó {formatMoney(centsToMoney(toCents(abonado)))}: termina por monto o partes.</p>
        )}
        {chargeMode !== 'pedidos' ? (
          <AccountAbonoForm
            key={chargeMode}
            token={token}
            spaceId={spaceId}
            restante={restante}
            mode={chargeMode}
            onCancel={() => setCollecting(false)}
            onDone={async (result) => {
              setCollecting(false);
              const changeText = result.abono.cambio !== '0.00' ? ` Cambio: ${formatMoney(result.abono.cambio)}.` : '';
              setNotice({
                tone: 'success',
                text: result.liquidada
                  ? `Cobrado ${formatMoney(result.abono.monto)}.${changeText} Cuenta saldada.`
                  : `Abonado ${formatMoney(result.abono.monto)}.${changeText} Falta ${formatMoney(result.restante)}.`,
              });
              await refresh();
            }}
          />
        ) : (
        <div className="transaction-form">
          {collect.isError && <Feedback tone="error">{errorMessage(collect.error)}</Feedback>}
          {aliases.length > 0 && (
            <div className="space-account__chips" role="group" aria-label="Cobrar la parte de">
              {aliases.map((alias) => (
                <Button
                  key={alias}
                  type="button"
                  variant="secondary"
                  onClick={() => setSelected(pending.filter((order) => order.pagara === alias).map((order) => order.id))}
                >
                  Parte de {alias}
                </Button>
              ))}
            </div>
          )}
          <ul className="space-account__orders">
            {pending.map((order, index) => (
              <li key={order.id} style={{ ['--i' as string]: index }}>
                <label>
                  <input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order)} />
                  <span>
                    <strong>#{order.folio} · {order.cliente?.nombre ?? 'Cliente'}</strong>
                    <small>{order.items_resumen}{order.pagara ? ` · Paga ${order.pagara}` : ''}</small>
                  </span>
                  <span>{formatMoney(centsToMoney(toCents(order.total)))}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="pay-method" role="radiogroup" aria-label="Forma de pago" data-method={method}>
            <span className="pay-method__indicator" aria-hidden="true" />
            <button type="button" role="radio" aria-checked={method === 'efectivo'} onClick={() => setMethod('efectivo')}>
              <Wallet aria-hidden="true" className="size-5" /> Efectivo
            </button>
            <button type="button" role="radio" aria-checked={method === 'terminal'} onClick={() => setMethod('terminal')}>
              <CreditCard aria-hidden="true" className="size-5" /> Terminal
            </button>
          </div>
          <TipPicker base={charge} value={tip} onChange={setTip} />
          <p className="space-account__charge">
            <ReceiptText aria-hidden="true" className="size-5" /> {tipValue !== '0.00' ? 'A cobrar con propina' : 'A cobrar'}{' '}
            <strong><RollingMoney value={toCollect} /></strong>
          </p>
          {method === 'efectivo' ? (
            <Field
              name="account-cash-received"
              label="Efectivo recibido"
              inputMode="decimal"
              placeholder="500.00"
              value={received}
              onChange={(event) => setReceived(event.target.value.trim())}
              hint={change !== null ? `Cambio: ${formatMoney(change)}` : 'Usa pesos con dos decimales, por ejemplo 500.00.'}
              error={MONEY_PATTERN.test(received) && change === null ? 'El efectivo no alcanza.' : undefined}
            />
          ) : (
            <p className="space-account__hint">Cobra {formatMoney(toCollect)} en la terminal y confirma cuando se apruebe.</p>
          )}
          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setCollecting(false)}>Cancelar</Button>
            <Button type="button" variant="dark" loading={collect.isPending} disabled={!canConfirmCharge} onClick={() => collect.mutate()}>
              Confirmar cobro
            </Button>
          </div>
        </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rental)}
        onOpenChange={(next) => { if (!next) closeRental(); }}
        title={rental ? `Renta de ${rental.espacio.nombre ?? data.espacio.nombre}` : 'Renta'}
        description={rental ? `${clock(rental.inicio)} a ${clock(rental.fin)} · ${durationLabel(rental.duracion_min)}. El horario queda apartado unos minutos mientras cobras.` : undefined}
      >
        {rental && (
          <div className="transaction-form">
            {payRental.isError && <Feedback tone="error">{errorMessage(payRental.error)}</Feedback>}
            <p className="space-account__charge">
              <ReceiptText aria-hidden="true" className="size-5" /> A cobrar <strong><RollingMoney value={rental.monto} /></strong>
            </p>
            <Field
              name="rental-cash-received"
              label="Efectivo recibido"
              inputMode="decimal"
              placeholder="500.00"
              value={rentalReceived}
              onChange={(event) => setRentalReceived(event.target.value.trim())}
              hint={rentalChange !== null ? `Cambio: ${formatMoney(rentalChange)}` : 'Usa pesos con dos decimales, por ejemplo 500.00.'}
              error={MONEY_PATTERN.test(rentalReceived) && rentalChange === null ? 'El efectivo no alcanza.' : undefined}
            />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={closeRental}>Cancelar renta</Button>
              <Button type="button" variant="dark" loading={payRental.isPending} disabled={rentalChange === null} onClick={() => payRental.mutate()}>
                Cobrar y rentar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
