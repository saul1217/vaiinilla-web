import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../types/api';
import { OrdersPage } from './orders-page';
const apiMock = vi.hoisted(() => ({ listOrders: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'token', context: { establecimiento_id: 'store' } } }) }));
const order: OrderDetail = {
  id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
  folio: 42,
  fecha_operativa: '2026-08-12',
  estado: 'cobrado',
  metodo_pago: 'efectivo',
  destino: 'para_llevar',
  espacio: null,
  subtotal: '46.00',
  ahorro_combinado: '0.00',
  cashback_otorgado: '0.00',
  total: '46.00',
  version: 2,
  creado_en: '2026-08-12T18:30:00.000Z',
  actualizado_en: '2026-08-12T18:31:00.000Z',
  notas_cocina: 'Sin azúcar',
  usuario: { nombre: 'Ana Pérez', matricula: 'A01234' },
  items: [
    {
      id: 501,
      producto_id: 101,
      nombre_producto: 'Chocolate caliente',
      estacion_preparacion: 'cocina',
      cantidad: 2,
      precio_digital_unitario: '23.00',
      subtotal: '46.00',
      opciones: [{ opcion_id: 7, nombre: 'Leche deslactosada', precio_extra: '0.00' }],
    },
  ],
};

function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 render(<QueryClientProvider client={client}><OrdersPage /></QueryClientProvider>);
 return userEvent.setup();
}
beforeEach(() => { vi.resetAllMocks(); apiMock.listOrders.mockResolvedValue({ orders: [order], cursor: null }); });
it('conserva filtros y solicitudes y abre un detalle de solo lectura con retorno de foco', async () => {
 const user = setup();
 const opener = await screen.findByRole('button', { name: 'Ver pedido 42' });
 expect(apiMock.listOrders).toHaveBeenCalledWith('token', { estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'], cursor: undefined, limit: 20 });
 await user.click(opener);
 expect(screen.getByRole('dialog', { name: 'Pedido 42' })).toBeInTheDocument();
 expect(screen.getByText('Pago')).toBeInTheDocument();
 expect(screen.getByText('Efectivo')).toBeInTheDocument();
 expect(screen.getByText('Para llevar')).toBeInTheDocument();
 expect(screen.getByText('Sin azúcar')).toBeInTheDocument();
 expect(screen.queryByRole('button', { name: /Cobrar|Entregar|Devolver/ })).not.toBeInTheDocument();
 await user.keyboard('{Escape}');
 await waitFor(() => expect(opener).toHaveFocus());
 for (const [label, estado] of [['Todos', undefined], ['Entregados', ['entregado']], ['Incidencias', ['cancelado', 'no_recogido', 'expirado']]] as const) {
   await user.click(screen.getByRole('button', { name: label }));
   await waitFor(() => expect(apiMock.listOrders).toHaveBeenLastCalledWith('token', { estado, cursor: undefined, limit: 20 }));
 }
});
it('mantiene cursor manual y señala conteos parciales', async () => {
 apiMock.listOrders.mockResolvedValueOnce({ orders: [order], cursor: 'next' }).mockResolvedValueOnce({ orders: [{ ...order, id: 'second', folio: 43 }], cursor: null });
 const user = setup();
 expect(await screen.findByText('1+ cargados')).toBeInTheDocument();
 await user.click(screen.getByRole('button', { name: 'Cargar más pedidos' }));
 expect(await screen.findByRole('button', { name: 'Ver pedido 43' })).toBeInTheDocument();
 expect(apiMock.listOrders).toHaveBeenLastCalledWith('token', { estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'], cursor: 'next', limit: 20 });
 expect(screen.getByText('2 cargados')).toBeInTheDocument();
});
it('distingue error de vacío y mantiene filas ante error de próxima página', async () => {
 apiMock.listOrders.mockResolvedValueOnce({ orders: [order], cursor: 'next' }).mockRejectedValue(new Error('Sin red'));
 const user = setup();
 await user.click(await screen.findByRole('button', { name: 'Cargar más pedidos' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('Sin red');
 expect(screen.getByRole('button', { name: 'Ver pedido 42' })).toBeInTheDocument();
 expect(screen.queryByText('No hay pedidos en este grupo')).not.toBeInTheDocument();
});
it('muestra vacío confirmado', async () => {
 apiMock.listOrders.mockResolvedValue({ orders: [], cursor: null }); setup();
 expect(await screen.findByText('No hay pedidos en este grupo')).toBeInTheDocument();
});
