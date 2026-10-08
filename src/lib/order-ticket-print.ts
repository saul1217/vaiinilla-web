import type { OrderDetail } from '../types/api';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function formatTicketDate(value: string): string {
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

function formatTicketAmount(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
    : `$${escapeHtml(value)}`;
}

function paymentMethodLabel(method: OrderDetail['metodo_pago']): string {
  return ({ efectivo: 'Efectivo', stripe: 'Tarjeta', saldo: 'Saldo Vaiinilla' })[method];
}

export function buildOrderTicketHtml(order: OrderDetail, establishmentName: string): string {
  const items = order.items.map((item) => `
    <li class="product-row"><span class="product-name">${item.cantidad}x ${escapeHtml(item.nombre_producto)}</span><strong class="amount">${formatTicketAmount(item.subtotal)}</strong></li>
    ${item.opciones.map((option) => `<li class="option"><span>+ ${escapeHtml(option.nombre)}</span></li>`).join('')}
    ${item.notas ? `<li class="option"><span>Nota: ${escapeHtml(item.notas)}</span></li>` : ''}
  `).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${order.folio}</title><style>
*{box-sizing:border-box}body{font:14px/1.4 Arial,sans-serif;color:#111;margin:0 auto;padding:20px;max-width:380px}
h1{font-size:24px;line-height:1.15;text-align:center;margin:0 0 16px}.meta{border-bottom:1px dashed #555;padding-bottom:12px;margin-bottom:12px}.meta p{margin:3px 0}.folio,.timestamp{font-size:12px;color:#444}.customer{font-size:16px;line-height:1.25;font-weight:800;letter-spacing:.025em;color:#111;margin:10px 0 0;overflow-wrap:break-word;word-break:normal}
ul{list-style:none;padding:0;margin:0}.product-row{display:flex;justify-content:space-between;gap:12px;padding:4px 0}.product-name{min-width:0;overflow-wrap:break-word;word-break:normal}.amount{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.option{font-size:12px;padding-left:12px;overflow-wrap:break-word;word-break:normal}
.totals{border-top:1px dashed #555;margin-top:20px;padding-top:12px}.total,.paid{display:flex;justify-content:space-between;gap:8px;margin:0}.total{font-size:18px;font-weight:800}.paid{font-weight:700;margin-top:7px}.method{margin-top:7px}
@media print{@page{size:80mm auto;margin:4mm}body{width:72mm;max-width:none;padding:0}}
</style></head><body>
<header><h1>${escapeHtml(establishmentName || 'Establecimiento')}</h1></header>
<section class="meta"><p class="folio">Folio #${order.folio}</p><p class="timestamp">${escapeHtml(formatTicketDate(order.creado_en))}</p><p class="customer">${escapeHtml((order.usuario?.nombre ?? 'Cliente').toLocaleUpperCase('es-MX'))}</p></section>
<ul>${items}</ul><section class="totals"><p class="total"><span>TOTAL</span><span class="amount">${formatTicketAmount(order.total)}</span></p>
<p class="paid"><span>PAGADO</span><span class="amount">${formatTicketAmount(order.monto_pagado ?? order.total)}</span></p><p class="method">Método: ${escapeHtml(paymentMethodLabel(order.metodo_pago))}</p></section>
<script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`;
}

export function printOrderTicket(order: OrderDetail, establishmentName: string): void {
  const popup = window.open('', '_blank', 'width=420,height=700');
  if (!popup) return;
  popup.document.open();
  popup.document.write(buildOrderTicketHtml(order, establishmentName));
  popup.document.close();
}
