import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantConfigPage } from './assistant-config-page';
import { VaiinillaApiError } from '../lib/api-error';

const apiMock = vi.hoisted(() => ({ businessSettings: vi.fn(), askStoreAssistant: vi.fn(), saveBusinessSettings: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AssistantConfigPage /></QueryClientProvider>);
}

describe('AssistantConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: 'ambos' });
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: '¿Qué te gustaría configurar?' });
    apiMock.saveBusinessSettings.mockResolvedValue({});
  });

  it('permanece oculto si el recurso de ajustes responde 404', async () => {
    apiMock.businessSettings.mockRejectedValue(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Not found' }));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it.each([new Error('Network error'), new VaiinillaApiError(503, { code: 'UNAVAILABLE', message: 'Unavailable' })])('muestra error recuperable ante fallas transitorias', async error => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockRejectedValueOnce(error).mockResolvedValueOnce({ asistente_modo: 'personal' });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Solo la tienda', pressed: true })).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it.each([405, 501])('mantiene visible la página y permite reintentar si ajustes responde %i', async status => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockRejectedValueOnce(new VaiinillaApiError(status, { code: 'UNAVAILABLE', message: 'Unavailable' }))
      .mockResolvedValueOnce({ asistente_modo: 'personal' });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Solo la tienda', pressed: true })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('oculta el selector cuando asistente_modo es null', async () => {
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: null });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    expect(screen.queryByText('Modo del asistente')).not.toBeInTheDocument();
  });

  it.each([['ambos', 'Tienda y clientes'], ['personal', 'Solo la tienda'], ['ninguno', 'Apagado']] as const)('guarda el modo %s sin invocar al modelo', async (mode, label) => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: mode === 'ambos' ? 'personal' : 'ambos' });
    renderPage();
    await user.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', { asistente_modo: mode }));
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('comprueba disponibilidad sin invocar al modelo al cargar', async () => {
    renderPage();
    expect(await screen.findByText('¿Qué te gustaría configurar en tu tienda?')).toBeVisible();
    expect(apiMock.businessSettings).toHaveBeenCalledWith('tenant-token');
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('mantiene el asistente y permite reintentar un envío fallido', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce({ mensaje: 'Listo' });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Configura mi tienda');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('button', { name: 'Reintentar envío' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    expect(await screen.findByText('Listo')).toBeVisible();
    expect(apiMock.askStoreAssistant).toHaveBeenCalledTimes(2);
  });

  it('mantiene la propuesta y permite reintentar una aplicación fallida', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: 'Propuesta lista', propuesta: { cambios: { tipo: 'cafeteria' } } });
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce({});
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Configura mi tienda');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await user.click(await screen.findByRole('button', { name: 'Aceptar y aplicar cambios' }));
    expect(await screen.findByRole('button', { name: 'Reintentar aplicación' })).toBeVisible();
    expect(screen.getByText('Asistente de configuración')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar aplicación' }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledTimes(2));
  });

  it('no ofrece la plática cuando el modo es ninguno', async () => {
    apiMock.businessSettings.mockResolvedValue({ asistente_modo: 'ninguno' });
    renderPage();
    expect(await screen.findByText('El asistente está apagado')).toBeVisible();
    expect(screen.queryByLabelText('Tu mensaje')).not.toBeInTheDocument();
  });

  it('manda el Excel en archivos y lo anuncia como [excel1] en el mensaje', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    const xlsx = new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'Inventario.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await user.upload(screen.getByLabelText('Archivo de Excel'), xlsx);
    expect(await screen.findByText('Inventario.xlsx')).toBeVisible();
    await user.type(screen.getByLabelText('Tu mensaje'), 'Da de alta mis insumos');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(apiMock.askStoreAssistant).toHaveBeenCalledWith('tenant-token',
      [{ rol: 'dueno', texto: 'Da de alta mis insumos [excel1]' }],
      [{ id: 'excel1', nombre: 'Inventario.xlsx', contenido: 'UEsDBA==' }]));
    // Ya mandado, sigue viajando en cada mensaje pero sin repetir el token.
    await screen.findByText('¿Qué te gustaría configurar?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Gracias');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(apiMock.askStoreAssistant).toHaveBeenLastCalledWith('tenant-token',
      expect.arrayContaining([{ rol: 'dueno', texto: 'Gracias' }]), [expect.objectContaining({ id: 'excel1' })]));
  });

  it('rechaza un archivo que no es .xlsx sin llamar al servidor', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.upload(screen.getByLabelText('Archivo de Excel'), new File(['a,b'], 'lista.csv', { type: 'text/csv' }));
    expect(await screen.findByText(/Solo se pueden mandar archivos de Excel/)).toBeVisible();
    expect(apiMock.askStoreAssistant).not.toHaveBeenCalled();
  });

  it('muestra el mensaje del servidor cuando no puede leer el Excel y deja quitarlo', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockRejectedValueOnce(new VaiinillaApiError(422, { code: 'ASSISTANT_FILE_INVALID', message: 'No pude leer «Menu.xlsx». Ábrelo en Excel, guárdalo como .xlsx y mándalo otra vez.' }));
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.upload(screen.getByLabelText('Archivo de Excel'), new File([new Uint8Array([0x50, 0x4b])], 'Menu.xlsx'));
    await user.type(screen.getByLabelText('Tu mensaje'), 'Mi menú');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/No pude leer «Menu.xlsx»/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar envío' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar Menu.xlsx' }));
    expect(screen.getByLabelText('Tu mensaje')).toHaveValue('Mi menú');
    expect(screen.queryByText('Menu.xlsx')).not.toBeInTheDocument();
  });

  it('aplica solo los ajustes y avisa qué secciones van desde la app', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: 'Va la propuesta', opciones: ['Sigue con lo demás'], sigue: true, quedan_mensajes: 5,
      propuesta: { cambios: { permite_pago_al_final: true }, motivos: { permite_pago_al_final: 'Abren cuenta en la mesa' }, espacios: [{ tipo: 'mesa', prefijo: 'Mesa', cantidad: 8 }], movimientos: [{ insumo_id: 1 }, { insumo_id: 2 }] } });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Tengo 8 mesas');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Mesas o lugares \(1\), Movimientos de inventario \(2\)/)).toBeVisible();
    expect(screen.getByText('Quedan 5 mensajes en esta plática.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sigue con lo demás' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Aceptar y aplicar cambios' }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', { permite_pago_al_final: true }));
  });

  it('sin ajustes del negocio no ofrece aplicar nada desde la web', async () => {
    const user = userEvent.setup();
    apiMock.askStoreAssistant.mockResolvedValue({ mensaje: 'Registro la entrada', propuesta: { cambios: {}, motivos: {}, movimientos: [{ insumo_id: 1 }] } });
    renderPage();
    await screen.findByText('¿Qué te gustaría configurar en tu tienda?');
    await user.type(screen.getByLabelText('Tu mensaje'), 'Me llegaron 10 kg de café');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Movimientos de inventario \(1\)/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceptar y aplicar cambios' })).not.toBeInTheDocument();
  });
});
