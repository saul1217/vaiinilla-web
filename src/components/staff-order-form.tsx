import { useMutation, useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage, VaiinillaApiError } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import type { OfflineStaffOrdersApi } from '../hooks/use-offline-staff-orders';
import { DurableStorageError, STORAGE_UNAVAILABLE_MESSAGE, shouldKeepOffline, type OfflineStaffOrder } from '../lib/offline-staff-orders';
import { clearStaffOrderDraft, loadStaffOrderDraft, saveStaffOrderDraft, type SavedStaffOrderDraft } from '../lib/staff-order-draft';
import { formatMoney } from '../lib/money';
import {
  alternarOpcion,
  borradorInicialStaff,
  construirPedidoStaff,
  erroresDePedido,
  espaciosParaPedido,
  llaveParaEnvio,
  MAX_LINE_QUANTITY,
  opcionesIniciales,
  pagoAlFinalPorDefecto,
  totalPedidoTexto,
  type LlaveDeEnvio,
  type StaffOrderDraft,
  type StaffOrderLine,
} from '../lib/staff-order';
import type { CatalogProduct, StaffOrderInput, StaffOrderResult } from '../types/api';
import { Button, Feedback, Field } from './ui';
import { StaffProductTile } from './staff-product-tile';
import { StaffOrderSummary } from './staff-order-summary';

const ESTADO_ESPACIO: Record<string, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  en_gracia: 'En gracia',
  por_cobrar: 'Por cobrar',
};

interface StaffOrderFormProps {
  token: string;
  /** mesero, cajero o admin: lo decide el backend; aquí solo se decide qué opciones mostrar. */
  rol: string;
  onCreated: (pedido: StaffOrderResult) => void;
  initialSpaceId?: number;
  /** Negocio, usuario y entorno: las consultas de otra sesión no se mezclan con las de esta. */
  queryScope?: string;
  /** Cola sin conexión de la sesión (solo con SIN_INTERNET_ENABLED). Sin ella, el formulario funciona como siempre. */
  offline?: OfflineStaffOrdersApi;
  /** Caja abierta al tomar el pedido: un cobro sin internet solo entra a esa caja. */
  cashSessionId?: string | null;
  onQueued?: (pedido: OfflineStaffOrder) => void;
}

const INICIAL_DE_ROL: Record<string, string> = { mesero: 'M', cajero: 'C', admin: 'A' };

function resumenDeLineas(draft: StaffOrderDraft): string {
  return draft.lineas.map((linea) => `${linea.cantidad}× ${linea.producto.nombre}`).join(', ');
}

function mensajeDeAlmacenamiento(error: unknown): string {
  return error instanceof DurableStorageError ? error.message : STORAGE_UNAVAILABLE_MESSAGE;
}

/** Lee el borrador guardado de esta sesión; si el almacenamiento falla, lo dice en vez de seguir callado. */
function borradorGuardado(offline: OfflineStaffOrdersApi | undefined): { guardado: SavedStaffOrderDraft | null; error: string | null } {
  if (!offline?.enabled || !offline.scope) return { guardado: null, error: null };
  try {
    return { guardado: loadStaffOrderDraft(offline.store, offline.scope), error: null };
  } catch (error) {
    return { guardado: null, error: mensajeDeAlmacenamiento(error) };
  }
}

const ESPERA_CONFIGURACION = 'Espera un momento: estamos cargando la configuración del negocio.';

export function StaffOrderForm(props: StaffOrderFormProps) {
  const configuracion = useQuery({
    queryKey: ['operational-settings', 'staff-order', props.queryScope ?? ''],
    queryFn: () => api.operationalSettings(props.token),
  });
  return (
    <StaffOrderFormBody
      {...props}
      configuracion={configuracion.data}
      errorConfiguracion={configuracion.isError}
      reintentarConfiguracion={() => void configuracion.refetch()}
    />
  );
}

function StaffOrderFormBody({
  token,
  rol,
  onCreated,
  initialSpaceId,
  queryScope = '',
  offline,
  cashSessionId,
  onQueued,
  configuracion,
  errorConfiguracion,
  reintentarConfiguracion,
}: StaffOrderFormProps & {
  configuracion?: { permite_pago_al_final: boolean; entrega_requiere_qr: boolean };
  errorConfiguracion: boolean;
  reintentarConfiguracion: () => void;
}) {
  const [search, setSearch] = useState('');
  const puedeCobrarAhora = rol === 'cajero';
  // Con la operación sin internet activa, el borrador y la llave del intento sobreviven a una
  // recarga: al reenviar el mismo pedido sale la misma Idempotency-Key.
  const [inicial] = useState(() => borradorGuardado(offline));
  const [draft, setDraft] = useState<StaffOrderDraft>(() =>
    inicial.guardado?.draft ?? borradorInicialStaff({ espacioId: initialSpaceId }),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [llave, setLlave] = useState<LlaveDeEnvio | null>(inicial.guardado?.llave ?? null);
  const [recuperado, setRecuperado] = useState(Boolean(inicial.guardado && inicial.guardado.draft.lineas.length > 0));
  const [errorAlmacenamiento, setErrorAlmacenamiento] = useState<string | null>(inicial.error);
  const [errorCola, setErrorCola] = useState<string | null>(null);
  const pagoAlFinalTocado = useRef(inicial.guardado?.pagoAlFinalTocado ?? false);
  // Si la configuración falla (por ejemplo 403), decide el servidor; solo se espera mientras carga.
  const cargandoConfiguracion = !configuracion && !errorConfiguracion;
  const guardarBorrador = offline?.enabled && offline.scope ? { store: offline.store, scope: offline.scope } : null;

  function persistir(siguienteLlave: LlaveDeEnvio | null, siguienteDraft: StaffOrderDraft = draft): boolean {
    if (!guardarBorrador) return true;
    try {
      saveStaffOrderDraft(guardarBorrador.store, guardarBorrador.scope, {
        draft: siguienteDraft,
        llave: siguienteLlave,
        pagoAlFinalTocado: pagoAlFinalTocado.current,
      });
      setErrorAlmacenamiento(null);
      return true;
    } catch (error) {
      setErrorAlmacenamiento(mensajeDeAlmacenamiento(error));
      return false;
    }
  }

  function olvidarBorrador() {
    if (!guardarBorrador) return;
    try {
      clearStaffOrderDraft(guardarBorrador.store, guardarBorrador.scope);
    } catch (error) {
      setErrorAlmacenamiento(mensajeDeAlmacenamiento(error));
    }
  }

  // Cada cambio que hace el personal se guarda junto con la llave vigente, si la hay.
  function cambiarBorrador(update: (previo: StaffOrderDraft) => StaffOrderDraft) {
    const siguiente = update(draft);
    if (siguiente === draft) return;
    setDraft(siguiente);
    persistir(llave, siguiente);
  }

  useEffect(() => {
    if (!configuracion) return;
    // T3-0011: si el negocio no permite pagar al final, se quita aunque el mesero ya la hubiera marcado.
    if (pagoAlFinalTocado.current && configuracion.permite_pago_al_final) return;
    setDraft((previo) => {
      const pagoAlFinal = pagoAlFinalPorDefecto(previo.destino, configuracion.permite_pago_al_final);
      if (previo.pagoAlFinal === pagoAlFinal) return previo;
      return { ...previo, pagoAlFinal };
    });
  }, [configuracion]);

  const catalogo = useQuery({
    queryKey: ['staff-order', 'catalog', queryScope],
    queryFn: () => api.catalog(token),
  });
  const disponibilidad = useQuery({
    queryKey: ['staff-order', 'spaces', queryScope],
    queryFn: () => api.spaceAvailability(token),
  });

  const crear = useMutation({
    mutationFn: ({ body, key }: { body: StaffOrderInput; key: string }) =>
      api.createStaffOrder(token, body, key),
    onSuccess: (pedido) => {
      olvidarBorrador();
      onCreated(pedido);
    },
    onError: (error, { body, key }) => {
      // T3-0011: el servidor no permite pagar al final (422). Se desmarca y se vuelve a leer la
      // configuración para que la casilla deje de ofrecerse; el personal revisa y reenvía.
      if (error instanceof VaiinillaApiError && error.code === 'PAYMENT_AT_END_NOT_ALLOWED') {
        pagoAlFinalTocado.current = false;
        setDraft((previo) => ({ ...previo, pagoAlFinal: false }));
        reintentarConfiguracion();
        return;
      }
      // Sin red o servidor caído: el pedido se guarda con la misma llave y se manda al volver.
      if (offline?.enabled && shouldKeepOffline(error)) guardarSinConexion(body, key);
    },
  });

  function guardarSinConexion(body: StaffOrderInput, key: string) {
    if (!offline?.enabled) return;
    if (body.metodo_pago !== 'efectivo') return;
    try {
      const nombreEspacio = espacios.find((fila) => fila.espacio.id === body.espacio_id)?.espacio.nombre;
      const pedido = offline.enqueue({
        input: body,
        idempotencyKey: key,
        roleInitial: INICIAL_DE_ROL[rol] ?? 'P',
        placeLabel: body.destino === 'en_espacio' ? nombreEspacio ?? 'Mesa' : 'Para llevar',
        summary: resumenDeLineas(draft),
        cashSessionId,
      });
      setErrorCola(null);
      olvidarBorrador();
      crear.reset();
      onQueued?.(pedido);
    } catch (error) {
      // No se guardó: no se da por tomado. El borrador sigue en pantalla.
      setErrorCola(mensajeDeAlmacenamiento(error));
    }
  }

  function actualizar(cambios: Partial<StaffOrderDraft>) {
    cambiarBorrador((previo) => ({ ...previo, ...cambios }));
  }

  function cambiarLinea(productoId: number, cambios: Partial<StaffOrderLine>) {
    cambiarBorrador((previo) => ({
      ...previo,
      lineas: previo.lineas.map((linea) =>
        linea.producto.id === productoId ? { ...linea, ...cambios } : linea,
      ),
    }));
  }

  function agregar(producto: CatalogProduct) {
    cambiarBorrador((previo) => {
      if (previo.lineas.some((linea) => linea.producto.id === producto.id)) return previo;
      const linea: StaffOrderLine = { producto, cantidad: 1, opcionIds: opcionesIniciales(producto) };
      return { ...previo, lineas: [...previo.lineas, linea] };
    });
  }

  function quitar(productoId: number) {
    cambiarBorrador((previo) => ({
      ...previo,
      lineas: previo.lineas.filter((linea) => linea.producto.id !== productoId),
    }));
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // T3-0011: mientras la configuración carga no se sabe si el negocio permite pagar al final.
    if (cargandoConfiguracion) {
      setErrores([ESPERA_CONFIGURACION]);
      return;
    }
    const nuevosErrores = erroresDePedido(draft);
    setErrores(nuevosErrores);
    if (nuevosErrores.length > 0) return;

    // T3-0011: con la configuración cargada se revalida aquí, no solo al pintar la casilla: si el
    // negocio no permite pagar al final, pago_diferido=true nunca sale (el servidor daría 422).
    const sinPagoAlFinal = configuracion?.permite_pago_al_final === false;
    const body = construirPedidoStaff(
      sinPagoAlFinal ? { ...draft, pagoAlFinal: false } : draft,
      sinPagoAlFinal ? false : pagoAlFinalTocado.current,
    );
    // La llave se reutiliza si el pedido no cambió; si cambió, una nueva (reusarla daría 409).
    const siguiente = llaveParaEnvio(llave, JSON.stringify(body), createIdempotencyKey);
    setLlave(siguiente);
    // La llave queda guardada antes de mandar: si la página se recarga a media petición, el
    // reenvío usa la misma. Si no se pudo guardar, se avisa y se manda igual con red.
    persistir(siguiente);
    setErrorCola(null);
    if (offline?.enabled && typeof navigator !== 'undefined' && navigator.onLine === false) {
      guardarSinConexion(body, siguiente.llave);
      return;
    }
    crear.mutate({ body, key: siguiente.llave });
  }

  function descartarBorrador() {
    olvidarBorrador();
    pagoAlFinalTocado.current = false;
    setLlave(null);
    setRecuperado(false);
    setDraft(borradorInicialStaff({ espacioId: initialSpaceId, permitePagoAlFinal: configuracion?.permite_pago_al_final }));
  }

  const espacios = disponibilidad.data ? espaciosParaPedido(disponibilidad.data) : [];
  const categorias = catalogo.data?.categorias ?? [];
  const productos = (catalogo.data?.productos ?? []).filter((producto) => producto.disponible);
  const cantidadPorProducto = new Map(draft.lineas.map((linea) => [linea.producto.id, linea]));

  return (
    <form className="staff-order" onSubmit={enviar}>
      {initialSpaceId !== undefined && <h3 className="staff-order__context">Pedido para {espacios.find((fila) => fila.espacio.id === draft.espacioId)?.espacio.nombre ?? 'mesa seleccionada'}</h3>}
      {errores.length > 0 && (
        <Feedback tone="error">
          <ul className="staff-order__errores">
            {errores.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Feedback>
      )}
      {recuperado && (
        <Feedback tone="info">
          Recuperamos el pedido que estabas tomando. Si lo vuelves a enviar sin cambios, no se duplica.
          <Button type="button" variant="ghost" onClick={descartarBorrador}>Empezar de nuevo</Button>
        </Feedback>
      )}
      {errorAlmacenamiento && <Feedback tone="error">{errorAlmacenamiento}</Feedback>}
      {errorCola && (
        <Feedback tone="error">
          No se guardó el pedido sin conexión. {errorCola}
        </Feedback>
      )}
      {crear.isError && !errorCola && (
        <Feedback tone="error">
          {errorMessage(crear.error)}
          <Button type="submit" variant="ghost">Reintentar</Button>
        </Feedback>
      )}
      {errorConfiguracion && (
        <Feedback tone="error">
          No se pudo cargar la configuración operativa. Revisa tu conexión e inténtalo de nuevo.
          <Button type="button" variant="ghost" onClick={reintentarConfiguracion}>Reintentar</Button>
        </Feedback>
      )}

        <Field
          id="staff-order-nombre"
          label="Nombre del cliente (opcional)"
          maxLength={120}
          value={draft.nombreCliente}
          onChange={(event) => actualizar({ nombreCliente: event.target.value })}
          hint='Si lo dejas vacío, el pedido se llama "Mostrador".'
        />

      <fieldset className="staff-order__bloque staff-order__destination">
        <legend>¿Dónde se sirve?</legend>
        <div className="staff-order__segmentos">
          <button
            type="button"
            aria-pressed={draft.destino === 'para_llevar'}
            onClick={() => actualizar({ destino: 'para_llevar', espacioId: null, pagoAlFinal: false })}
          >
            Para llevar
          </button>
          <button
            type="button"
            aria-pressed={draft.destino === 'en_espacio'}
            onClick={() =>
              actualizar({
                destino: 'en_espacio',
                pagoAlFinal: pagoAlFinalPorDefecto('en_espacio', configuracion?.permite_pago_al_final ?? false),
              })
            }
          >
            En mesa
          </button>
        </div>
        {draft.destino === 'en_espacio' && (
          <div className="staff-order__espacios" role="group" aria-label="Mesa o espacio">
            {disponibilidad.isError && (
              <Feedback tone="error">
                No se pudieron cargar las mesas.
                <Button type="button" variant="ghost" onClick={() => void disponibilidad.refetch()}>Reintentar</Button>
              </Feedback>
            )}
            {espacios.map((fila) => (
              <button
                key={fila.espacio.id}
                type="button"
                aria-pressed={draft.espacioId === fila.espacio.id}
                onClick={() => actualizar({ espacioId: fila.espacio.id })}
              >
                <span>{fila.espacio.nombre}</span>
                <small>{ESTADO_ESPACIO[fila.estado] ?? fila.estado}</small>
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="staff-order__bloque staff-order__catalog">
        <legend>Productos</legend>
        <Field id="staff-product-search" label="Buscar en el menú" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {catalogo.isPending && <p role="status">Cargando productos…</p>}
        {catalogo.isSuccess && productos.length === 0 && <p>No hay productos disponibles.</p>}
        {productos.length > 0 && !productos.some((producto) => producto.nombre.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))) && (
          <div role="status"><p>Sin coincidencias.</p><Button type="button" variant="ghost" onClick={() => setSearch('')}>Limpiar búsqueda</Button></div>
        )}
        {catalogo.isError && (
          <Feedback tone="error">
            {errorMessage(catalogo.error)}
            <Button type="button" variant="ghost" onClick={() => void catalogo.refetch()}>Reintentar</Button>
          </Feedback>
        )}
        {categorias.map((categoria) => {
          const delaCategoria = productos.filter((producto) => producto.categoria_id === categoria.id && producto.nombre.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
          if (delaCategoria.length === 0) return null;
          return (
            <section key={categoria.id} className="staff-order__categoria">
              <h3>{categoria.nombre}</h3>
              {delaCategoria.map((producto) => {
                const linea = cantidadPorProducto.get(producto.id);
                return (
                  <StaffProductTile key={producto.id} product={producto} selected={Boolean(linea)}>
                    {linea ? (
                      <button type="button" className="staff-order__quitar" onClick={() => quitar(producto.id)}>
                        Quitar
                      </button>
                    ) : (
                      <button type="button" className="staff-order__agregar" onClick={() => agregar(producto)}>
                        <Plus aria-hidden="true" className="size-4" /> Agregar
                      </button>
                    )}
                    {linea && (
                      <div className="staff-order__linea">
                        <div className="staff-order__cantidad" role="group" aria-label={`Cantidad de ${producto.nombre}`}>
                          <button
                            type="button"
                            aria-label="Quitar uno"
                            disabled={linea.cantidad <= 1}
                            onClick={() => cambiarLinea(producto.id, { cantidad: linea.cantidad - 1 })}
                          >
                            <Minus aria-hidden="true" className="size-4" />
                          </button>
                          <output>{linea.cantidad}</output>
                          <button
                            type="button"
                            aria-label="Agregar uno"
                            disabled={linea.cantidad >= MAX_LINE_QUANTITY}
                            onClick={() => cambiarLinea(producto.id, { cantidad: linea.cantidad + 1 })}
                          >
                            <Plus aria-hidden="true" className="size-4" />
                          </button>
                        </div>
                        {producto.grupos_opcion.map((grupo) => (
                          <div key={grupo.id} className="staff-order__grupo" role="group" aria-label={grupo.nombre}>
                            <span>
                              {grupo.nombre}
                              {grupo.min_selecciones >= 1 ? ' · obligatorio' : ' · opcional'}
                            </span>
                            <div>
                              {grupo.opciones.map((opcion) => {
                                const elegida = linea.opcionIds.includes(opcion.id);
                                return (
                                  <button
                                    key={opcion.id}
                                    type="button"
                                    aria-pressed={elegida}
                                    onClick={() =>
                                      cambiarLinea(producto.id, {
                                        opcionIds: alternarOpcion(linea.opcionIds, grupo, opcion.id),
                                      })
                                    }
                                  >
                                    {opcion.nombre}
                                    {opcion.precio_extra !== '0.00' && ` +${formatMoney(opcion.precio_extra)}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </StaffProductTile>
                );
              })}
            </section>
          );
        })}
      </fieldset>

      <fieldset className="staff-order__bloque staff-order__customer">
        <legend>Cliente y pago</legend>
        <p className="staff-order__metodo">Efectivo <span>Otros métodos los paga el cliente en la app.</span></p>

        {/* T3-0011: sin permite_pago_al_final el servidor rechaza el pedido; la opción no se ofrece. */}
        {draft.destino === 'en_espacio' && configuracion?.permite_pago_al_final !== false && (
          <label className="staff-order__check">
            <input
              type="checkbox"
              checked={draft.pagoAlFinal}
              onChange={(event) => {
                pagoAlFinalTocado.current = true;
                actualizar({ pagoAlFinal: event.target.checked, cobrarAhora: false, montoRecibido: '' });
              }}
            />
            Pagar al final, con la cuenta de la mesa
          </label>
        )}
        {puedeCobrarAhora && !draft.pagoAlFinal && (
          <label className="staff-order__check">
            <input
              type="checkbox"
              checked={draft.cobrarAhora}
              onChange={(event) => actualizar({ cobrarAhora: event.target.checked, montoRecibido: '' })}
            />
            Cobrar ahora en efectivo
          </label>
        )}
        {draft.cobrarAhora && (
          <Field
            id="staff-order-recibido"
            label="Efectivo recibido (opcional)"
            inputMode="decimal"
            placeholder={totalPedidoTexto(draft.lineas)}
            value={draft.montoRecibido}
            onChange={(event) => actualizar({ montoRecibido: event.target.value })}
            hint="Vacío = cobro del total exacto."
          />
        )}
      </fieldset>

      <StaffOrderSummary>
        {draft.lineas.length > 0 && <details className="staff-order__selected">
          <summary>Ver pedido ({draft.lineas.length})</summary>
          <ul>{draft.lineas.map((linea) => <li key={linea.producto.id}>{linea.cantidad} × {linea.producto.nombre}</li>)}</ul>
        </details>}
        <p>
          Total <strong>{formatMoney(totalPedidoTexto(draft.lineas))}</strong>
          <small>El servidor calcula el total final.</small>
        </p>
        <Button type="submit" loading={crear.isPending} disabled={cargandoConfiguracion}>
          {draft.cobrarAhora ? 'Enviar y cobrar' : 'Enviar pedido'}
        </Button>
      </StaffOrderSummary>
    </form>
  );
}
