import { useQueryClient, type Query } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSessions } from '../context/session-context';
import { CORTES_QUERY_ROOT, type CortesScope } from '../lib/cortes-reporte';

/** La sesión de negocio vigente como alcance de los cortes; null sin sesión. */
export function useCortesScope(): CortesScope | null {
  const { tenant } = useSessions();
  const establecimientoId = tenant?.context.establecimiento_id ?? '';
  const membresiaId = tenant?.context.membresia_id ?? tenant?.access.membresia_id ?? '';
  const usuarioId = tenant?.context.usuario_id ?? '';
  if (!establecimientoId || !membresiaId || !usuarioId) return null;
  return { establecimientoId, membresiaId, usuarioId };
}

/**
 * Al cambiar de sesión (otro negocio, otra membresía, otra persona o cerrar sesión)
 * cancela las peticiones de cortes y contabilidad en curso y borra su caché. Solo deja
 * la de la sesión vigente: son datos financieros y no deben cruzar de un negocio a otro.
 */
export function useCortesSessionIsolation(scope: CortesScope | null) {
  const queryClient = useQueryClient();
  const establecimientoId = scope?.establecimientoId ?? '';
  const membresiaId = scope?.membresiaId ?? '';
  const usuarioId = scope?.usuarioId ?? '';

  useEffect(() => {
    const ajena = (query: Query) => {
      const [, negocio, membresia, usuario] = query.queryKey;
      return !establecimientoId
        || negocio !== establecimientoId
        || membresia !== membresiaId
        || usuario !== usuarioId;
    };
    const filtro = { queryKey: [CORTES_QUERY_ROOT], predicate: ajena };
    void queryClient.cancelQueries(filtro);
    queryClient.removeQueries(filtro);
  }, [queryClient, establecimientoId, membresiaId, usuarioId]);
}
