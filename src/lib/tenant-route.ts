import type { OperationalRole } from '../types/api';

export function tenantHomePath(role: OperationalRole): string {
  if (role === 'admin') return '/app';
  if (role === 'cocina') return '/app/cocina';
  return '/app/pos';
}
