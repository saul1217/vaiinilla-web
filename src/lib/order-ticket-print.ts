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

export function buildOrderTicketHtml(order: OrderDetail, establishmentName: string): string {
  const items = order.items.map((item) => `
    <li><span>${item.cantidad}× ${escapeHtml(item.nombre_producto)}</span><strong>$${escapeHtml(item.subtotal)}</strong></li>
    ${item.opciones.map((option) => `<li class="option"><span>+ ${escapeHtml(option.nombre)}</span></li>`).join('')}
    ${item.notas ? `<li class="option"><span>Nota: ${escapeHtml(item.notas)}</span></li>` : ''}
  `).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${order.folio}</title><style>
*{box-sizing:border-box}body{font:14px/1.4 Arial,sans-serif;color:#111;margin:0 auto;padding:20px;max-width:380px;overflow-wrap:anywhere}
h1{font-size:24px;line-height:1.15;text-align:center;margin:0 0 16px}p{margin:4px 0}.meta{border-bottom:1px dashed #555;padding-bottom:12px;margin-bottom:12px}
ul{list-style:none;padding:0;margin:0}li{display:flex;justify-content:space-between;gap:12px;padding:4px 0}li span{min-width:0}li strong{white-space:nowrap}.option{font-size:12px;padding-left:12px}
.totals{border-top:1px dashed #555;margin-top:12px;padding-top:10px}.total{font-size:18px;font-weight:bold}.paid{font-weight:bold;margin-top:6px}
@media print{@page{size:80mm auto;margin:4mm}body{width:72mm;max-width:none;padding:0}}
</style></head><body>
<header><h1>${escapeHtml(establishmentName || 'Establecimiento')}</h1></header>
<section class="meta"><p>Folio #${order.folio}</p><p>${escapeHtml(new Date(order.creado_en).toLocaleString('es-MX'))}</p><p>${escapeHtml(order.usuario?.nombre ?? 'Cliente')}</p></section>
<ul>${items}</ul><section class="totals"><p class="total"><span>TOTAL</span> <span>$${escapeHtml(order.total)}</span></p>
<p class="paid">PAGADO&nbsp;&nbsp; $${escapeHtml(order.monto_pagado ?? order.total)}</p><p>Método: ${escapeHtml(order.metodo_pago === 'efectivo' ? 'Efectivo' : order.metodo_pago)}</p></section>
<script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`;
}

export function printOrderTicket(order: OrderDetail, establishmentName: string): void {
  const popup = window.open('', '_blank', 'width=420,height=700');
  if (!popup) return;
  popup.document.open();
  popup.document.write(buildOrderTicketHtml(order, establishmentName));
  popup.document.close();
}
