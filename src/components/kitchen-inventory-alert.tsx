// Aviso de insumos en Cocina (Doop AI3): lo agotado en coral y lo que no alcanza en ámbar, con el
// proveedor, «Llamar» y «Ver insumos». GET /inventario/avisos (todo el personal), cada minuto.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { inventoryAlertDetail, inventoryAlertHeadline, inventoryAlertSupplier, inventoryAlertsEmpty } from '../lib/kitchen-extras';

export function KitchenInventoryAlert({ token, scopeId, showLink = true }: { token: string; scopeId: string; showLink?: boolean }) {
  const alerts = useQuery({
    queryKey: ['inventario', scopeId, 'avisos'],
    enabled: Boolean(token),
    queryFn: () => api.inventoryAlerts(token),
    refetchInterval: 60_000,
  });
  if (!alerts.data || inventoryAlertsEmpty(alerts.data)) return null;
  const urgent = alerts.data.agotados.length > 0;
  const supplier = inventoryAlertSupplier(alerts.data);
  return (
    <section className={`kitchen-stock-alert ${urgent ? 'kitchen-stock-alert--urgent' : ''}`} aria-label="Aviso de insumos">
      <strong role="alert">{inventoryAlertHeadline(alerts.data)}</strong>
      <p>{inventoryAlertDetail(alerts.data)}</p>
      {supplier && <small>{[supplier.nombre, supplier.telefono].filter(Boolean).join(' · ')}</small>}
      <div className="kitchen-stock-alert__actions">
        {supplier?.telefono && <a className="button button--secondary" href={`tel:${supplier.telefono.replace(/[^0-9+]/g, '')}`}>Llamar</a>}
        {showLink && <Link className="button button--secondary" to="/app/inventario">Ver insumos</Link>}
      </div>
    </section>
  );
}
