import { useQuery } from '@tanstack/react-query';
import { ChefHat, Clock3, Radio, ShoppingBag, WalletCards } from 'lucide-react';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { Feedback } from './ui';

export function OperationalStatusPanel() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const status = useQuery({
    queryKey: ['operational-status', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.operationalStatus(token),
    refetchInterval: 5_000,
  });

  if (status.isError) {
    return <Feedback tone="error">No se pudo consultar el estado operativo. {errorMessage(status.error)}</Feedback>;
  }

  if (status.isPending || !status.data) {
    return (
      <section className="operational-panel operational-panel--loading" aria-label="Estado operativo" aria-busy="true">
        <span className="skeleton-line skeleton-line--wide" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
      </section>
    );
  }

  const data = status.data;
  return (
    <section className={`operational-panel ${data.recibiendo_pedidos ? 'operational-panel--ready' : ''}`} aria-labelledby="operational-title">
      <div className="operational-panel__lead">
        <span className="operational-panel__main-icon"><ShoppingBag aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Estado en vivo</p>
          <h2 id="operational-title">{data.recibiendo_pedidos ? 'Recibiendo pedidos' : 'No está recibiendo pedidos'}</h2>
          <p>
            {data.recibiendo_pedidos
              ? 'Caja abierta y dispositivos operativos conectados.'
              : operationalReason(data)}
          </p>
        </div>
      </div>

      <div className="operational-signals" aria-label="Señales operativas">
        <Signal icon={WalletCards} label="Sesión de Caja" active={data.sesion_caja_abierta} activeText="Abierta" inactiveText="Cerrada" />
        <Signal icon={Radio} label="Dispositivo Caja" active={data.caja_en_linea} activeText="En línea" inactiveText="Sin conexión" />
        <Signal icon={ChefHat} label="Dispositivo Cocina" active={data.cocina_en_linea} activeText="En línea" inactiveText="Sin conexión" />
        <div className="operational-signal">
          <Clock3 aria-hidden="true" />
          <span><small>Tiempo estimado</small><strong>{data.tiempo_estimado_min === null ? 'Sin dato' : `${data.tiempo_estimado_min} min`}</strong></span>
        </div>
      </div>

      <p className="operational-panel__updated">
        Actualizado {new Intl.DateTimeFormat('es-MX', { timeStyle: 'medium' }).format(new Date(data.consultado_en))}
      </p>
    </section>
  );
}

function Signal({
  icon: Icon,
  label,
  active,
  activeText,
  inactiveText,
}: {
  icon: typeof WalletCards;
  label: string;
  active: boolean;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <div className={`operational-signal ${active ? 'operational-signal--active' : 'operational-signal--inactive'}`}>
      <Icon aria-hidden="true" />
      <span><small>{label}</small><strong>{active ? activeText : inactiveText}</strong></span>
    </div>
  );
}

function operationalReason(status: {
  sesion_caja_abierta: boolean;
  caja_en_linea: boolean;
  cocina_en_linea: boolean;
}): string {
  const missing = [];
  if (!status.sesion_caja_abierta) missing.push('abrir la sesión de Caja');
  if (!status.caja_en_linea) missing.push('conectar Caja');
  if (!status.cocina_en_linea) missing.push('conectar Cocina');
  return missing.length ? `Hace falta ${missing.join(', ')}.` : 'El establecimiento no está disponible para operación nueva.';
}
