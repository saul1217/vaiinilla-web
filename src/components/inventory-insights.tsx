// Inventario › historial, reporte por periodo y asistente (Expo `admin-inventory.tsx`).
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { qtyLabel } from '../lib/inventory';
import { addLocalDays, localDay, MOVEMENT_LABEL, periodRange } from '../lib/inventory-period';
import { formatMoney } from '../lib/money';
import type { InventoryStock } from '../types/api';
import { Button, Feedback, Field, SelectField } from './ui';
import { Card, LoadingState } from './vai';

const money = (n: number | undefined) => formatMoney((n ?? 0).toFixed(2));
const signedMoney = (n: number | undefined) => `${(n ?? 0) < 0 ? '−' : ''}${money(Math.abs(n ?? 0))}`;
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${qtyLabel(Math.abs(n), unit)}`;
const when = (iso: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

function PeriodFields({ from, to, onFrom, onTo, idPrefix }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; idPrefix: string }) {
  return (
    <div className="inventory-period">
      <Field name={`${idPrefix}-from`} label="Desde" type="date" value={from} max={to} onChange={(event) => event.target.value && onFrom(event.target.value)} />
      <Field name={`${idPrefix}-to`} label="Hasta" type="date" value={to} min={from} onChange={(event) => event.target.value && onTo(event.target.value)} />
    </div>
  );
}

export function InventoryHistory({ token, scope, supplies }: { token: string; scope: string; supplies: InventoryStock[] }) {
  const today = localDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [supply, setSupply] = useState('');
  const movements = useQuery({
    queryKey: ['inventario', scope, 'movimientos', from, to, supply],
    enabled: Boolean(token),
    queryFn: () => api.inventoryMovements(token, { ...periodRange(from, to), insumoId: supply ? Number(supply) : null }),
  });
  const list = movements.data ?? [];
  return (
    <Card title="Historial" description="Cada entrada, merma, conteo, ajuste y venta que movió el inventario.">
      <PeriodFields from={from} to={to} onFrom={setFrom} onTo={setTo} idPrefix="history" />
      <SelectField name="history-supply" label="Insumo" value={supply} onChange={(event) => setSupply(event.target.value)}>
        <option value="">Todos</option>
        {supplies.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </SelectField>
      {movements.isError ? (
        <Feedback tone="error">{errorMessage(movements.error)}</Feedback>
      ) : movements.isPending ? (
        <LoadingState label="Cargando historial…" cards={1} />
      ) : list.length === 0 ? (
        <p className="inventory-hint">No hubo movimientos en esas fechas.</p>
      ) : (
        <ul className="inventory-history">
          {list.map((movement) => (
            <li key={movement.id}>
              <span>
                <strong>{MOVEMENT_LABEL[movement.tipo] ?? movement.tipo} · {movement.insumo}</strong>
                <small>
                  {[movement.folio != null ? `Pedido #${movement.folio}` : null, movement.nota, movement.registrado_por, when(movement.creado_en)].filter(Boolean).join(' · ')}
                </small>
              </span>
              <span className="inventory-history__qty">
                <strong data-negative={movement.cantidad < 0}>{signed(movement.cantidad, movement.unidad)}</strong>
                <small>Quedó {qtyLabel(movement.existencia_resultante, movement.unidad)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function InventoryReportCard({ token, scope }: { token: string; scope: string }) {
  const today = localDay();
  const [from, setFrom] = useState(addLocalDays(today, -6));
  const [to, setTo] = useState(today);
  const report = useQuery({
    queryKey: ['inventario', scope, 'reporte', from, to],
    enabled: Boolean(token),
    queryFn: () => api.inventoryReport(token, periodRange(from, to)),
  });
  const rows = (report.data?.insumos ?? []).filter((row) => row.entradas || row.vendido || row.mermas || row.diferencias || row.inicial || row.final);
  const totals = report.data?.totales;
  return (
    <Card title="Reporte por periodo" description="Con qué empezó cada insumo, qué entró, qué se vendió, qué se perdió y con qué terminó.">
      <PeriodFields from={from} to={to} onFrom={setFrom} onTo={setTo} idPrefix="report" />
      {report.isError ? (
        <Feedback tone="error">{errorMessage(report.error)}</Feedback>
      ) : report.isPending ? (
        <LoadingState label="Armando el reporte…" cards={1} />
      ) : (
        <>
          <dl className="inventory-figures">
            <div><dt>Costo de lo vendido</dt><dd>{money(totals?.costo_vendido)}</dd></div>
            <div><dt>Mermas</dt><dd>{money(totals?.costo_mermas)}</dd></div>
            <div><dt>Diferencias</dt><dd>{signedMoney(totals?.costo_diferencias)}</dd></div>
            <div><dt>Compras</dt><dd>{money(totals?.compras_monto)}</dd></div>
          </dl>
          {rows.length === 0 ? (
            <p className="inventory-hint">Sin insumos en ese periodo.</p>
          ) : (
            <div className="inventory-report__scroll">
              <table className="inventory-report">
                <thead>
                  <tr><th scope="col">Insumo</th><th scope="col">Inicial</th><th scope="col">Entradas</th><th scope="col">Vendido</th><th scope="col">Mermas</th><th scope="col">Diferencia</th><th scope="col">Final</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} data-low={row.bajo_minimo}>
                      <th scope="row">{row.nombre}</th>
                      <td>{qtyLabel(row.inicial, row.unidad)}</td>
                      <td>{row.entradas ? `+${qtyLabel(row.entradas, row.unidad)}` : '—'}</td>
                      <td>{row.vendido ? qtyLabel(row.vendido, row.unidad) : '—'}</td>
                      <td>{row.mermas ? qtyLabel(row.mermas, row.unidad) : '—'}</td>
                      <td>{row.diferencias ? signed(row.diferencias, row.unidad) : '—'}</td>
                      <td><strong>{qtyLabel(row.final, row.unidad)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

type ChatLine = { rol: 'personal' | 'asistente'; texto: string };

export function InventoryAssistant({ token }: { token: string }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState('');
  const [options, setOptions] = useState<string[]>(['¿Qué se me acaba primero?', '¿Qué me falta para mañana?', '¿Qué productos están agotados?']);
  const [left, setLeft] = useState<number | null>(null);
  const ask = useMutation({
    mutationFn: (history: ChatLine[]) => api.inventoryAssistant(token, history),
    onSuccess: (reply) => {
      setLines((current) => [...current, { rol: 'asistente', texto: reply.mensaje.trim() }]);
      setOptions((reply.opciones ?? []).filter((option) => option.trim()));
      if (typeof reply.quedan_mensajes === 'number') setLeft(reply.quedan_mensajes);
    },
  });
  const send = (question: string) => {
    const clean = question.trim();
    if (!clean || ask.isPending || left === 0) return;
    const history: ChatLine[] = [...lines, { rol: 'personal', texto: clean }];
    setLines(history);
    setText('');
    ask.mutate(history);
  };
  return (
    <Card title="Pregúntale al asistente" description="Contesta con tu inventario de ahorita: lo que hay, lo que se acaba y lo que falta.">
      {lines.length > 0 && (
        <ol className="inventory-chat" aria-live="polite">
          {lines.map((line, index) => (
            <li key={index} data-from={line.rol}>{line.texto}</li>
          ))}
          {ask.isPending && <li data-from="asistente" aria-busy="true">Revisando tu inventario…</li>}
        </ol>
      )}
      {ask.isError && <Feedback tone="error">{errorMessage(ask.error)}</Feedback>}
      {options.length > 0 && left !== 0 && (
        <div className="inventory-chat__options">
          {options.map((option) => <Button key={option} variant="secondary" disabled={ask.isPending} onClick={() => send(option)}>{option}</Button>)}
        </div>
      )}
      {left === 0 ? (
        <p className="inventory-hint">Se acabaron los mensajes de esta plática. Recarga la página para empezar otra.</p>
      ) : (
        <form className="inventory-chat__form" onSubmit={(event) => { event.preventDefault(); send(text); }}>
          <Field name="inventory-question" label="Tu pregunta" placeholder="¿Cuánto tengo de papa?" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" loading={ask.isPending} disabled={!text.trim()}><Send aria-hidden="true" className="size-4" /> Preguntar</Button>
        </form>
      )}
      {left !== null && left > 0 && left <= 5 && <p className="inventory-hint"><MessageCircle aria-hidden="true" className="size-4" /> Quedan {left} mensajes en esta plática.</p>}
    </Card>
  );
}
