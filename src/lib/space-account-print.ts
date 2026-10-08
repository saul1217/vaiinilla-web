import type { OrderDetail, SpaceSessionDetail, SpaceAccountOrder } from '../types/api';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function money(amount: number | string): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(value)
    ? `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
    : '$0.00';
}

function sessionDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const period = part('dayPeriod').replace(/^([ap])\.m\.$/i, '$1. m.');
  return `${part('day')}/${part('month')}/${part('year')} · ${part('hour')}:${part('minute')} ${period}`.trim();
}

function renderOrder(order: SpaceAccountOrder, detail: OrderDetail | null | undefined): string {
  if (!detail?.items.length) {
    return `<div class="order-ref">Pedido #${order.folio}</div><div class="item-row"><span class="item-name">${escapeHtml(order.items_resumen)}</span><span class="amount">${money(order.total)}</span></div>`;
  }

  const items = detail.items.map((item) => {
    const options = item.opciones.map((option) => {
      const extra = Number(option.precio_extra) > 0 ? ` · ${money(option.precio_extra)} c/u` : '';
      return `<div class="item-note">+ ${escapeHtml(option.nombre)}${extra}</div>`;
    }).join('');
    const note = item.notas ? `<div class="item-note">${escapeHtml(item.notas)}</div>` : '';
    const rejection = item.rechazo
      ? `<div class="item-note">Rechazado · no incluido (${money(item.rechazo.monto)})</div>`
      : '';
    const amount = item.rechazo ? 'Rechazado' : money(item.subtotal);
    return `<div class="product"><div class="item-row"><span class="item-name">${item.cantidad}x ${escapeHtml(item.nombre_producto)}</span><span class="amount">${amount}</span></div>${options}${note}${rejection}</div>`;
  }).join('');

  return `<div class="order-ref">Pedido #${order.folio}</div>${items}`;
}

/** HTML aislado de la cuenta para imprimir; la agrupación y los importes vienen del backend. */
export function buildSpaceAccountPrintHtml(
  detail: SpaceSessionDetail,
  businessName: string | undefined,
  orderDetails: ReadonlyMap<string, OrderDetail | null>,
): string {
  const account = detail.cuenta;
  if (!account) return '';

  const byId = new Map(account.pedidos.map((order) => [order.id, order]));
  let rows: string;
  if (account.grupos?.length) {
    const covered = new Set<string>();
    const groups = account.grupos
      .filter((group) => group.pedidos.some((id) => byId.has(id)))
      .map((group) => {
        const orders = group.pedidos
          .map((id) => byId.get(id))
          .filter((order): order is SpaceAccountOrder => Boolean(order));
        orders.forEach((order) => covered.add(order.id));
        const items = orders.map((order) => renderOrder(order, orderDetails.get(order.id))).join('');
        return `<section class="group"><h2>${escapeHtml(group.etiqueta.toLocaleUpperCase('es-MX'))}</h2>${items}<div class="subtotal"><span>Subtotal ${escapeHtml(group.etiqueta)}</span><span class="amount">${money(group.total)}</span></div></section>`;
      })
      .join('');
    const leftover = account.pedidos
      .filter((order) => !covered.has(order.id))
      .map((order) => renderOrder(order, orderDetails.get(order.id)))
      .join('');
    rows = `${groups}${leftover}`;
  } else {
    rows = account.pedidos.map((order) => renderOrder(order, orderDetails.get(order.id))).join('');
  }

  const establishment = businessName?.trim() || 'Establecimiento';
  const sessionStarted = detail.sesion?.inicio
    ? sessionDateTime(detail.sesion.inicio)
    : null;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(establishment)} · ${escapeHtml(detail.espacio.nombre)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.receipt{width:100%;max-width:80mm;margin:0 auto;padding:12px}.receipt-header{text-align:center;border-bottom:1px dashed #555;padding:2px 0 10px;margin-bottom:8px}h1{font-size:22px;line-height:1.15;margin:0 0 6px;font-weight:800;overflow-wrap:break-word;word-break:normal}.space-name{font-size:14px;font-weight:700;margin:0}.session-meta{font-size:11px;margin:3px 0 0;color:#333}.group{padding:11px 0 8px;border-bottom:1px dashed #888;break-inside:avoid;page-break-inside:avoid}h2{font-size:16px;line-height:1.2;letter-spacing:.025em;margin:0 0 7px;font-weight:900;overflow-wrap:break-word;word-break:normal}.order-ref{font-size:10px;color:#444;margin:4px 0 2px}.product{break-inside:avoid;page-break-inside:avoid}.item-row,.subtotal,.total-row,.balance-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:8px;align-items:start}.item-row{padding:2px 0}.item-name{min-width:0;overflow-wrap:break-word;word-break:normal}.amount{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.item-note{padding-left:8px;font-size:10px;overflow-wrap:break-word;word-break:normal}.subtotal{font-size:12px;font-weight:800;border-top:1px dotted #777;padding-top:6px;margin-top:7px;break-inside:avoid}.receipt-footer{padding-top:14px}.total-row{font-weight:900;font-size:17px;border-top:1px solid #111;padding-top:10px;margin-top:2px;break-inside:avoid}.balance-row{font-size:12px;padding-top:5px}.receipt-footer .amount{font-weight:800}.empty-note{font-size:11px;margin:6px 0 0;color:#444}@page{size:auto;margin:3mm}@media print{html,body{width:100%;margin:0;padding:0}.receipt{max-width:80mm;padding:0}.group,.product,.subtotal,.total-row,.balance-row{break-inside:avoid;page-break-inside:avoid}h1,h2{break-after:avoid-page;page-break-after:avoid}}@media screen and (max-width:420px){.receipt{max-width:100%;padding:10px}body{font-size:11px}.item-row,.subtotal,.total-row,.balance-row{gap:5px}}
</style></head><body><main class="receipt" aria-label="Cuenta de mesa">
<header class="receipt-header"><h1>${escapeHtml(establishment)}</h1><p class="space-name">${escapeHtml(detail.espacio.nombre)}</p>${sessionStarted ? `<p class="session-meta">Sesión · ${escapeHtml(sessionStarted)}</p>` : ''}</header>
<div class="receipt-groups">${rows || '<p class="empty-note">Sin pedidos registrados.</p>'}</div>
<footer class="receipt-footer"><div class="total-row"><span>TOTAL</span><span class="amount">${money(account.total)}</span></div><div class="balance-row"><span>PAGADO</span><span class="amount">${money(account.pagado)}</span></div><div class="balance-row"><span>POR PAGAR</span><span class="amount">${money(account.pendiente)}</span></div></footer>
</main><script>window.onload=function(){window.print()}</script></body></html>`;
}
