import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentCard } from '../lib/student-counter';
import { StudentCounterPage } from './student-counter-page';

const apiMock = vi.hoisted(() => ({
  operationalStatus: vi.fn(),
  searchStudents: vi.fn(),
  findStudentByCredential: vi.fn(),
  studentPurchase: vi.fn(),
  assignStudentCredential: vi.fn(),
  deliverStudentOrder: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 't', context: { establecimiento_id: 'e1', usuario_id: 'c1', rol: 'cajero' } } }),
}));
vi.mock('../components/qr-token-field', () => ({
  QrTokenField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Credencial" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const lia: StudentCard = {
  usuario_id: 'u-lia',
  nombre: 'Lia Prueba Kao',
  matricula: 'KAO-211',
  grupo: '1A',
  saldo: '150.00',
  gastado_hoy: '20.00',
  limite_diario: '60.00',
  alergenos: ['cacahuate'],
  nota_tutor: 'Nada de refresco',
  productos_bloqueados: [2],
  categorias_bloqueadas: [],
  productos_con_alergeno: [],
  productos_sin_revisar: [],
  pide_pin: true,
  pedidos_hoy: [{ id: 'o-1', folio: 41, estado: 'listo', version: 3, total: '25.00', resumen: '1× Torta' }],
};

const product = (id: number, nombre: string, precio: string) => ({
  id, categoria_id: 1, estacion_preparacion: 'cocina', nombre, descripcion: null, ingredientes: null, alergenos: null,
  tiempo_estimado_min: 5, precio_mostrador: precio, precio_digital: precio, disponible: true, imagen_url: null, grupos_opcion: [],
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('Caja › Alumnos sin teléfono', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.operationalStatus.mockResolvedValue({ modo_escuela: true, sesion_caja_abierta: true, entrega_requiere_qr: true });
    apiMock.searchStudents.mockResolvedValue([lia]);
    apiMock.catalog.mockResolvedValue({ categorias: [], productos: [product(1, 'Agua', '15.00'), product(2, 'Refresco', '20.00'), product(3, 'Torta', '35.00')] });
  });

  it('busca por nombre, respeta tope, bloqueos y PIN, y cobra de su saldo con una sola llave por carrito', async () => {
    const user = userEvent.setup();
    apiMock.studentPurchase.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ folio: 52 });
    render(<StudentCounterPage />, { wrapper });

    await user.type(screen.getByLabelText('Nombre o matrícula'), 'lia');
    await user.click(await screen.findByRole('button', { name: /Lia Prueba Kao/ }));
    expect(apiMock.searchStudents).toHaveBeenCalledWith('t', 'lia', expect.anything());

    expect(screen.getByText('Nota del tutor: Nada de refresco')).toBeInTheDocument();
    expect(screen.getByText('$40.00 MXN')).toBeInTheDocument();
    expect(screen.getByText(/Alérgico a cacahuate/)).toBeInTheDocument();
    expect(await screen.findByText('$20.00 MXN · No lo autorizó su tutor')).toBeInTheDocument();
    expect(screen.getByLabelText('Refresco: no disponible para este alumno')).toBeInTheDocument();
    expect(screen.getByText('Para entregar, búscalo con su credencial.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar Torta' }));
    await user.click(screen.getByRole('button', { name: 'Agregar Agua' }));
    expect(screen.getByText('Hoy solo puede gastar $40.00 MXN.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cobrar \$50.00 MXN de su saldo/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Quitar uno de Torta' }));
    expect(screen.getByText('Su tutor le puso PIN: pídeselo.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('PIN de Lia'), '12a34');
    const charge = screen.getByRole('button', { name: /Cobrar \$15.00 MXN de su saldo/ });
    await user.click(charge);
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    await user.type(screen.getByLabelText('PIN de Lia'), '1234');
    await user.click(screen.getByRole('button', { name: /Cobrar \$15.00 MXN de su saldo/ }));

    expect(await screen.findByText('Pedido #52 a cocina.')).toBeInTheDocument();
    const [first, second] = apiMock.studentPurchase.mock.calls as unknown[][];
    if (!first || !second) throw new Error('Se esperaban dos intentos');
    expect(first.slice(0, 4)).toEqual(['t', 'u-lia', [{ producto_id: 1, cantidad: 1, opcion_ids: [] }], '1234']);
    expect(second[4]).toBe(first[4]);
  });

  it('con su credencial lo encuentra y le entrega lo de hoy usando la credencial como QR', async () => {
    const user = userEvent.setup();
    apiMock.findStudentByCredential.mockResolvedValue({ ...lia, pide_pin: false });
    apiMock.deliverStudentOrder.mockResolvedValue({ folio: 41 });
    render(<StudentCounterPage />, { wrapper });

    await user.type(screen.getByLabelText('Credencial'), 'cred-abc');
    await user.click(screen.getByRole('button', { name: /Buscar por credencial/ }));
    await user.click(await screen.findByRole('button', { name: 'Entregar' }));

    await waitFor(() => expect(apiMock.deliverStudentOrder).toHaveBeenCalledWith('t', 'o-1', 3, 'cred-abc'));
    expect(await screen.findByText('Pedido #41 entregado.')).toBeInTheDocument();
  });

  it('una credencial que no es de nadie lo dice; con la caja cerrada no cobra', async () => {
    const user = userEvent.setup();
    apiMock.findStudentByCredential.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...lia, pide_pin: false, limite_diario: null });
    apiMock.operationalStatus.mockResolvedValue({ modo_escuela: true, sesion_caja_abierta: false, entrega_requiere_qr: true });
    render(<StudentCounterPage />, { wrapper });

    await user.type(screen.getByLabelText('Credencial'), 'nada');
    await user.click(screen.getByRole('button', { name: /Buscar por credencial/ }));
    expect(await screen.findByText('No encontramos ningún alumno con esa credencial.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Credencial'));
    await user.type(screen.getByLabelText('Credencial'), 'cred-abc');
    await user.click(screen.getByRole('button', { name: /Buscar por credencial/ }));
    await user.click(await screen.findByRole('button', { name: 'Agregar Agua' }));
    expect(screen.getByText('Abre la caja para cobrar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cobrar \$15.00 MXN de su saldo/ })).toBeDisabled();
  });

  it('hace su credencial QR después de confirmar y la enseña una sola vez', async () => {
    const user = userEvent.setup();
    apiMock.assignStudentCredential.mockResolvedValue({ id: 'c1', tipo: 'qr', valor: 'VAI-ALUMNO-xyz' });
    render(<StudentCounterPage />, { wrapper });

    await user.type(screen.getByLabelText('Nombre o matrícula'), 'lia');
    await user.click(await screen.findByRole('button', { name: /Lia Prueba Kao/ }));
    await user.click(screen.getByRole('button', { name: /Credencial/ }));
    await user.click(await screen.findByRole('button', { name: /Hacer credencial QR/ }));
    expect(screen.getByText('Si Lia Prueba Kao ya tenía una, deja de servir.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hacer credencial' }));

    await waitFor(() => expect(apiMock.assignStudentCredential).toHaveBeenCalledWith('t', 'u-lia', 'qr', null, expect.any(String)));
    expect(await screen.findByText(/este código no se vuelve a mostrar/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Credencial de Lia Prueba Kao' })).toBeInTheDocument();
  });
});
