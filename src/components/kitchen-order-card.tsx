import {
  Clock3,
  CookingPot,
  MapPin,
  MessageSquareText,
  PackageCheck,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { minutesSince, type KitchenStage } from '../lib/kitchen';
import type { OrderDetail } from '../types/api';

const stageCopy: Record<KitchenStage, { label: string; timeLabel: string }> = {
  pending: { label: 'Pendiente', timeLabel: 'Esperando' },
  preparing: { label: 'En preparación', timeLabel: 'Preparando' },
  ready: { label: 'Listo', timeLabel: 'Listo hace' },
};

const itemSectionLabel: Record<KitchenStage, string> = {
  pending: 'Preparar',
  preparing: 'En preparación',
  ready: 'Preparado',
};

export function KitchenOrderCard({
  order,
  stage,
  now,
  action,
}: {
  order: OrderDetail;
  stage: KitchenStage;
  now: number;
  action?: ReactNode;
}) {
  const referenceTime = stage === 'pending' ? order.creado_en : order.actualizado_en;
  const elapsedMinutes = minutesSince(referenceTime, now);
  const ageTone = elapsedMinutes >= 20 ? 'high' : elapsedMinutes >= 10 ? 'medium' : 'normal';
  const totalUnits = order.items.reduce((total, item) => total + item.cantidad, 0);
  const destination = destinationLabel(order);
  const DestinationIcon = order.destino === 'para_llevar' ? ShoppingBag : MapPin;

  return (
    <article
      className={`kitchen-ticket kitchen-ticket--${stage} kitchen-ticket--age-${ageTone}`}
      aria-label={`Pedido ${order.folio}, ${stageCopy[stage].label}`}
    >
      <header className="kitchen-ticket__header">
        <div className="kitchen-ticket__folio">
          <span>Pedido</span>
          <h3>#{order.folio}</h3>
        </div>
        <div className="kitchen-ticket__timer" aria-label={elapsedAccessibleLabel(stage, elapsedMinutes)}>
          <Clock3 aria-hidden="true" />
          <span>
            <strong>{elapsedLabel(stage, elapsedMinutes)}</strong>
            <small>{absoluteTimeLabel(stage, referenceTime)}</small>
          </span>
        </div>
      </header>

      <div className="kitchen-ticket__route">
        <DestinationIcon aria-hidden="true" />
        <span>
          <small>Entrega</small>
          <strong>{destination}</strong>
        </span>
        <span className="kitchen-ticket__unit-count">
          {totalUnits} {totalUnits === 1 ? 'pieza' : 'piezas'}
        </span>
      </div>

      <section className="kitchen-ticket__items" aria-labelledby={`kitchen-items-${order.id}`}>
        <div className="kitchen-ticket__section-title">
          <CookingPot aria-hidden="true" />
          <h4 id={`kitchen-items-${order.id}`}>{itemSectionLabel[stage]}</h4>
          <span>{order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}</span>
        </div>
        <ul aria-label="Productos a preparar">
          {order.items.map((item) => (
            <li key={item.id}>
              <strong className="kitchen-ticket__quantity" aria-label={`${item.cantidad} unidades`}>
                {item.cantidad}
              </strong>
              <div className="kitchen-ticket__product">
                <strong>{item.nombre_producto}</strong>
                {item.opciones.length > 0 && (
                  <ul className="kitchen-ticket__options" aria-label={`Opciones de ${item.nombre_producto}`}>
                    {item.opciones.map((option) => (
                      <li key={option.opcion_id}>{option.nombre}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className={`kitchen-ticket__note ${order.notas_cocina ? '' : 'kitchen-ticket__note--empty'}`}>
        <MessageSquareText aria-hidden="true" />
        <span>
          <strong>Indicaciones especiales</strong>
          <p>{order.notas_cocina || 'Sin indicaciones especiales.'}</p>
        </span>
      </div>

      <div className="kitchen-ticket__customer">
        <UserRound aria-hidden="true" />
        <span>
          <small>Cliente</small>
          <strong>{order.usuario?.nombre ?? 'Cliente'}</strong>
          {order.usuario?.matricula && <small>{order.usuario.matricula}</small>}
        </span>
        {stage === 'ready' && (
          <span className="kitchen-ticket__ready-state">
            <PackageCheck aria-hidden="true" /> Esperando entrega
          </span>
        )}
      </div>

      {action && <footer className="kitchen-ticket__action">{action}</footer>}
    </article>
  );
}

function destinationLabel(order: OrderDetail): string {
  if (order.destino === 'para_llevar') return 'Para llevar';
  return order.espacio?.nombre ?? 'En espacio';
}

function elapsedLabel(stage: KitchenStage, minutes: number): string {
  if (minutes < 1) {
    if (stage === 'pending') return 'Recién recibido';
    if (stage === 'preparing') return 'Recién iniciado';
    return 'Listo ahora';
  }

  const duration = formatDuration(minutes);
  return `${stageCopy[stage].timeLabel} ${duration}`;
}

function elapsedAccessibleLabel(stage: KitchenStage, minutes: number): string {
  if (minutes < 1) return elapsedLabel(stage, minutes);
  return `${stageCopy[stage].label}: ${formatDuration(minutes)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

function absoluteTimeLabel(stage: KitchenStage, value: string): string {
  const prefix = stage === 'pending' ? 'Entró' : stage === 'preparing' ? 'Inició' : 'Terminado';
  return `${prefix} ${new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))}`;
}
