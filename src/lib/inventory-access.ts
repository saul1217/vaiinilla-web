import type { InventoryPermissions } from '../types/api';

export type InventoryScope = { storeId: string; membershipId: string; userId: string; role: string };

/**
 * Claves de caché del inventario: incluyen negocio, membresía, identidad y rol para que nunca se
 * reutilice `puede_editar` (ni insumos o recetas) de otra sesión, otra tienda u otro rol.
 */
export function inventoryKeys(scope: InventoryScope) {
  const base = ['inventory', scope.storeId, scope.membershipId, scope.userId, scope.role] as const;
  return {
    all: base,
    overview: [...base, 'overview'] as const,
    products: [...base, 'products'] as const,
    recipe: (productId: number) => [...base, 'recipe', productId] as const,
  };
}

/**
 * Desde la migración 205 el backend dice si esta sesión edita (`puede_editar`). Cocina solo edita
 * con ese permiso explícito; sin el dato (backend anterior a la 205) solo el admin edita.
 */
export function canEditInventory(role: string, permissions: InventoryPermissions | undefined) {
  if (typeof permissions?.puede_editar === 'boolean') return permissions.puede_editar && (role !== 'cocina' || permissions.cocina_edita === true);
  return role === 'admin';
}
