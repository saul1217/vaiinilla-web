import { BadgePercent, WalletCards } from 'lucide-react';
import { PageHeader } from '../components/ui';

export function CashbackComingSoonPage() {
  return (
    <div className="page-stack cashback-coming-soon">
      <PageHeader
        eyebrow="Administración financiera"
        title="Cashback y wallet"
        description="Estamos preparando esta herramienta para los establecimientos Vaiinilla."
      />
      <section className="cashback-coming-soon__card panel-card" aria-labelledby="cashback-coming-soon-title">
        <div className="cashback-coming-soon__icon" aria-hidden="true">
          <BadgePercent />
          <WalletCards />
        </div>
        <span className="cashback-coming-soon__badge" role="status">Próximamente</span>
        <h2 id="cashback-coming-soon-title">Esta función aún no está disponible</h2>
        <p>
          Los flujos de cashback y wallet todavía no están habilitados para uso diario. Por ahora,
          puedes seguir operando pedidos y pagos desde Caja / POS.
        </p>
      </section>
    </div>
  );
}
