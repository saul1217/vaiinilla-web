// «Para mañana» (Doop K05): en una escuela, Cocina ve lo que los tutores ya apartaron, por día,
// para preparar con anticipación. GET /menu-dias/:fecha/apartados (admin, cocina y cajero).
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AppSheet } from './app-sheet';
import { Chip, ChipRow } from './vai';
import { Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { reservedDayOptions } from '../lib/kitchen-extras';

export function KitchenReserved({ token, scopeId, open, onOpenChange }: { token: string; scopeId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const days = useMemo(() => reservedDayOptions(), []);
  const [fecha, setFecha] = useState(days[0]!.fecha);
  const day = useQuery({
    queryKey: ['escuela', scopeId, 'apartados', fecha],
    enabled: open && Boolean(token),
    queryFn: () => api.schoolReservedDay(token, fecha),
  });
  const summary = !day.data ? '' : day.data.sin_servicio
    ? `No hay servicio este día: ${day.data.sin_servicio}.`
    : day.data.pedidos === 0 ? 'Sin apartados.' : day.data.pedidos === 1 ? '1 apartado.' : `${day.data.pedidos} apartados.`;

  return (
    <AppSheet open={open} onOpenChange={onOpenChange} title="Para mañana" description="Lo que ya apartaron los tutores, por día, para preparar con anticipación.">
      <div className="kitchen-reserved">
        <ChipRow label="Día" scroll>
          {days.map((option) => (
            <Chip key={option.fecha} selected={option.fecha === fecha} onClick={() => setFecha(option.fecha)}>{option.label}</Chip>
          ))}
        </ChipRow>
        {day.isPending ? <p role="status">Consultando lo apartado…</p> : day.isError ? (
          <Feedback tone="error">{errorMessage(day.error)}</Feedback>
        ) : (
          <>
            <p className="kitchen-reserved__summary" role="status">{summary}</p>
            {day.data.productos.length > 0 && (
              <ul className="kitchen-reserved__list" aria-label="Productos apartados">
                {day.data.productos.map((product) => (
                  <li key={product.producto_id}>
                    <strong>{product.cantidad}</strong>
                    <span>{product.nombre}</span>
                    <small>{product.pedidos === 1 ? '1 pedido' : `${product.pedidos} pedidos`}</small>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AppSheet>
  );
}
