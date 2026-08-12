import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { OperationalRole } from '../types/api';

export type HeartbeatRole = Extract<OperationalRole, 'cajero' | 'cocina' | 'mesero'>;

const heartbeatRoles = new Set<OperationalRole>(['cajero', 'cocina', 'mesero']);

export function isHeartbeatRole(role: OperationalRole | undefined): role is HeartbeatRole {
  return Boolean(role && heartbeatRoles.has(role));
}

export function useOperationalHeartbeat({
  token,
  scopeId,
  role,
}: {
  token: string;
  scopeId: string;
  role: OperationalRole | undefined;
}) {
  const heartbeatRole = isHeartbeatRole(role) ? role : null;
  const [deviceId] = useState(() => (
    heartbeatRole ? getOperationalDeviceId(heartbeatRole) : ''
  ));

  return useQuery({
    queryKey: ['operational-heartbeat', scopeId, heartbeatRole, deviceId],
    enabled: Boolean(token) && Boolean(heartbeatRole) && Boolean(deviceId),
    queryFn: async () => {
      if (!heartbeatRole) return false;
      await api.heartbeat(token, deviceId, heartbeatRole);
      return true;
    },
    refetchInterval: 5_000,
    // Operational profiles commonly run in separate windows. Losing focus must
    // not make an otherwise open Caja or Cocina disappear after 15 seconds.
    refetchIntervalInBackground: true,
    retry: 1,
  });
}

function getOperationalDeviceId(role: HeartbeatRole): string {
  const storageKey = `vaiinilla-${role}-device`;
  try {
    const current = window.sessionStorage.getItem(storageKey);
    if (current) return current;
    const next = `web-${role}-${window.crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `web-${role}-${window.crypto.randomUUID()}`;
  }
}
