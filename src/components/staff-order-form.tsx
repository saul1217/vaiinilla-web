import { useMutation, useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { formatMoney } from '../lib/money';
import {
  alternarOpcion,
  BORRADOR_VACIO,
  construirPedidoStaff,
  erroresDePedido,
  espaciosParaPedido,
  llaveParaEnvio,
  MAX_LINE_QUANTITY,
  opcionesIniciales,
  totalPedidoTexto,
  type LlaveDeEnvio,
  type StaffOrderDraft,
  type StaffOrderLine,
} from '../lib/staff-order';
import type { CatalogProduct, StaffOrderInput, StaffOrderResult } from '../types/api';
import { Button, Feedback, Field } from './ui';

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
}

export function StaffOrderForm({ token, rol, onCreated }: StaffOrderFormProps) {
  const puedeCobrarAhora = rol === 'cajero';
  const [draft, setDraft] = useState<StaffOrderDraft>(BORRADOR_VACIO);
  const [errores, setErrores] = useState<string[]>([]);
  const [llave, setLlave] = useState<LlaveDeEnvio | null>(null);

  const catalogo = useQuery({
    queryKey: ['staff-order', 'catalog'],
    queryFn: () => api.catalog(token),
  });
  const disponibilidad = useQuery({
    queryKey: ['staff-order', 'spaces'],
    queryFn: () => api.spaceAvailability(token),
  });

  const crear = useMutation({
    mutationFn: ({ body, key }: { body: StaffOrderInput; key: string }) =>
      api.createStaffOrder(token, body, key),
    onSuccess: (pedido) => onCreated(pedido),
  });

  function actualizar(cambios: Partial<StaffOrderDraft>) {
    setDraft((previo) => ({ ...previo, ...cambios }));
  }

  function cambiarLinea(productoId: number, cambios: Partial<StaffOrderLine>) {
    setDraft((previo) => ({
      ...previo,
      lineas: previo.lineas.map((linea) =>
        linea.producto.id === productoId ? { ...linea, ...cambios } : linea,
      ),
    }));
  }

  function agregar(producto: CatalogProduct) {
    setDraft((previo) => {
      if (previo.lineas.some((linea) => linea.producto.id === producto.id)) return previo;
      const linea: StaffOrderLine = { producto, cantidad: 1, opcionIds: opcionesIniciales(producto) };
      return { ...previo, lineas: [...previo.lineas, linea] };
    });
  }

  function quitar(productoId: number) {
    setDraft((previo) => ({
      ...previo,
      lineas: previo.lineas.filter((linea) => linea.producto.id !== productoId),
    }));
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nuevosErrores = erroresDePedido(draft);
    setErrores(nuevosErrores);
    if (nuevosErrores.length > 0) return;

    const body = construirPedidoStaff(draft);
    // La llave se reutiliza si el pedido no cambió; si cambió, una nueva (reusarla daría 409).
    const siguiente = llaveParaEnvio(llave, JSON.stringify(body), createIdempotencyKey);
    setLlave(siguiente);
    crear.mutate({ body, key: siguiente.llave });
  }

  const espacios = disponibilidad.data ? espaciosParaPedido(disponibilidad.data) : [];
  const categorias = catalogo.data?.categorias ?? [];
  const productos = (catalogo.data?.productos ?? []).filter((producto) => producto.disponible);
  const cantidadPorProducto = new Map(draft.lineas.map((linea) => [linea.producto.id, linea]));

  return (
    <form className="staff-order" onSubmit={enviar}>
      {errores.length > 0 && (
        <Feedback tone="error">
          <ul className="staff-order__errores">
            {errores.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Feedback>
      )}
      {crear.isError && <Feedback tone="error">{errorMessage(crear.error)}</Feedback>}

      <fieldset className="staff-order__bloque">
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
            onClick={() => actualizar({ destino: 'en_espacio' })}
          >
            En mesa
          </button>
        </div>
        {draft.destino === 'en_espacio' && (
          <div className="staff-order__espacios" role="group" aria-label="Mesa o espacio">
            {disponibilidad.isError && <Feedback tone="error">No se pudieron cargar las mesas.</Feedback>}
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

      <fieldset className="staff-order__bloque">
        <legend>Productos</legend>
        {catalogo.isError && <Feedback tone="error">{errorMessage(catalogo.error)}</Feedback>}
        {categorias.map((categoria) => {
          const delaCategoria = productos.filter((producto) => producto.categoria_id === categoria.id);
          if (delaCategoria.length === 0) return null;
          return (
            <section key={categoria.id} className="staff-order__categoria">
              <h3>{categoria.nombre}</h3>
              {delaCategoria.map((producto) => {
                const linea = cantidadPorProducto.get(producto.id);
                return (
                  <article key={producto.id} className="staff-order__producto" data-agregado={Boolean(linea)}>
                    <div>
                      <strong>{producto.nombre}</strong>
                      <span>{formatMoney(producto.precio_mostrador)}</span>
                    </div>
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
                  </article>
                );
              })}
            </section>
          );
        })}
      </fieldset>

      <fieldset className="staff-order__bloque">
        <legend>Cliente y pago</legend>
        <Field
          id="staff-order-nombre"
          label="Nombre del cliente (opcional)"
          maxLength={120}
          value={draft.nombreCliente}
          onChange={(event) => actualizar({ nombreCliente: event.target.value })}
          hint='Si lo dejas vacío, el pedido se llama "Mostrador".'
        />
        <p className="staff-order__metodo">Efectivo <span>Otros métodos los paga el cliente en la app.</span></p>

        {draft.destino === 'en_espacio' && (
          <label className="staff-order__check">
            <input
              type="checkbox"
              checked={draft.pagoAlFinal}
              onChange={(event) =>
                actualizar({ pagoAlFinal: event.target.checked, cobrarAhora: false, montoRecibido: '' })
              }
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

      <div className="staff-order__pie">
        <p>
          Total <strong>{formatMoney(totalPedidoTexto(draft.lineas))}</strong>
          <small>El servidor calcula el total final.</small>
        </p>
        <Button type="submit" loading={crear.isPending}>
          {draft.cobrarAhora ? 'Enviar y cobrar' : 'Enviar pedido'}
        </Button>
      </div>
    </form>
  );
}
