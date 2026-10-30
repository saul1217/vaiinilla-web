import type { Page } from '@playwright/test';
import type { OrderDetail } from '../../src/types/api';
import { installStaffR2Mocks } from './staff-r2';

export async function installKitchenSliceMocks(page: Page, theme: string, scenario: 'active' | 'empty' | 'error' = 'active') {
  await installStaffR2Mocks(page, 'cocina', theme);
  const orders: OrderDetail[] = (['por_cobrar', 'preparando', 'listo'] as const).map((estado, i) => ({
    id: `kitchen-${i}`, folio: 71 + i, estado, version: 4, destino: 'para_llevar', espacio: null,
    creado_en: '2026-10-30T18:40:00Z', actualizado_en: '2026-10-30T18:50:00Z',
    llegada_en: i === 1 ? '2026-10-30T18:55:00Z' : null,
    notas_cocina: 'Salsa aparte', usuario: { nombre: 'Ana', matricula: 'A123' }, invitado: true,
    items: [{ id: 1, producto_id: 1, nombre_producto: 'Tacos', estacion_preparacion: 'cocina', cantidad: 2,
      precio_digital_unitario: '10.00', subtotal: '20.00', opciones: [{ opcion_id: 1, nombre: 'Verde', precio_extra: '0.00' }] },
    { id: 2, producto_id: 2, nombre_producto: 'Agua', estacion_preparacion: 'caja', cantidad: 1,
      precio_digital_unitario: '10.00', subtotal: '10.00', opciones: [] }],
  } as OrderDetail));
  await page.route('**/src/lib/api.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const apiUrl = '/mock-api';
    let orders = ${JSON.stringify(scenario === 'empty' ? [] : orders)};
    export const api = {
      heartbeat: async()=>{},
      operationalStatus: async()=>({recibiendo_pedidos:true,sesion_caja_abierta:true,caja_en_linea:true,cocina_en_linea:true,tiempo_estimado_min:null,entrega_requiere_qr:false,consultado_en:'2026-10-30T19:00:00Z'}),
      listOrders: async()=>{ ${scenario === 'error' ? "throw Error('Error de consulta sembrado');" : 'return {orders,cursor:null};'} },
      transitionOrder: async(token,id,target,version)=>{
        await fetch('/mock-kitchen/transition', {method:'POST',body:JSON.stringify({token,id,target,version})});
        const updated = {...orders.find(o=>o.id===id),estado:target,version:version+1};
        orders = orders.map(o=>o.id===id ? updated : o); return updated;
      },
      rejectOrder: async(token,id,version,motivo)=>{
        const response = await fetch('/mock-kitchen/reject', {method:'POST',body:JSON.stringify({token,id,version,motivo})});
        if (!response.ok) throw Error('Rechazo no disponible');
        orders = orders.filter(o=>o.id!==id);
      },
      rejectOrderItem: async(token,id,itemId,version,motivo)=>{
        const response = await fetch('/mock-kitchen/item', {method:'POST',body:JSON.stringify({token,id,itemId,version,motivo})});
        if (!response.ok) throw Error('Rechazo no disponible');
        orders = orders.map(o=>o.id===id ? {...o,version:version+1,items:o.items.map(item=>item.id===itemId ? {...item,rechazo:{motivo}} : item)} : o);
        return {rechazo:{pedido_item_id:itemId,motivo,monto:'0.00',metodo_reembolso:'ninguno'},devolucion:null};
      }
    };
  ` }));
  await page.route('**/mock-kitchen/**', route => route.fulfill({ json: {} }));
}
