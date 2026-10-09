import { describe, expect, it } from 'vitest';
import type { CatalogProduct, SpaceAvailability } from '../types/api';
import {
  alternarOpcion,
  BORRADOR_VACIO,
  construirPedidoStaff,
  erroresDeLinea,
  erroresDePedido,
  espaciosParaPedido,
  llaveParaEnvio,
  opcionesIniciales,
  totalLineaCents,
  totalPedidoCents,
  type StaffOrderDraft,
  type StaffOrderLine,
} from './staff-order';

function producto(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 1,
    categoria_id: 10,
    estacion_preparacion: 'cocina',
    nombre: 'Taco',
    descripcion: null,
    ingredientes: null,
    alergenos: null,
    tiempo_estimado_min: 5,
    precio_mostrador: '20.00',
    precio_digital: '20.00',
    disponible: true,
    imagen_url: null,
    grupos_opcion: [],
    ...overrides,
  };
}

const TORTILLA = {
  id: 100,
  nombre: 'Tortilla',
  min_selecciones: 1,
  max_selecciones: 1,
  opciones: [
    { id: 101, nombre: 'Maíz', precio_extra: '0.00' },
    { id: 102, nombre: 'Harina', precio_extra: '5.50' },
  ],
};

const SALSAS = {
  id: 200,
  nombre: 'Salsas',
  min_selecciones: 0,
  max_selecciones: 2,
  opciones: [
    { id: 201, nombre: 'Verde', precio_extra: '0.00' },
    { id: 202, nombre: 'Roja', precio_extra: '0.00' },
    { id: 203, nombre: 'Extra picante', precio_extra: '3.00' },
  ],
};

function linea(overrides: Partial<StaffOrderLine> = {}): StaffOrderLine {
  return { producto: producto({ grupos_opcion: [TORTILLA, SALSAS] }), cantidad: 1, opcionIds: [101], ...overrides };
}

function borrador(overrides: Partial<StaffOrderDraft> = {}): StaffOrderDraft {
  return { ...BORRADOR_VACIO, lineas: [linea()], ...overrides };
}

function espacio(id: number, nombre: string, tipo: SpaceAvailability['espacio']['tipo'], precioHora: string | null): SpaceAvailability {
  return {
    espacio: { id, nombre, tipo },
    estado: 'libre',
    saldada: true,
    inicio: null,
    fin_previsto: null,
    precio_hora: precioHora,
    proxima_reserva: null,
  };
}

describe('espacios para un pedido de staff', () => {
  it('ordena por nombre y deja fuera las canchas que se rentan', () => {
    const lista = espaciosParaPedido([
      espacio(3, 'Mesa 10', 'mesa', null),
      espacio(1, 'Cancha 2', 'cancha', '150.00'),
      espacio(2, 'Mesa 2', 'mesa', null),
    ]);

    expect(lista.map((fila) => fila.espacio.nombre)).toEqual(['Mesa 2', 'Mesa 10']);
  });
});

describe('opciones y totales', () => {
  it('un grupo de elección única exige exactamente una opción', () => {
    expect(erroresDeLinea(linea({ opcionIds: [] }))).toEqual(['Tortilla: elige al menos 1.']);
    expect(erroresDeLinea(linea({ opcionIds: [101] }))).toEqual([]);
  });

  it('respeta el máximo de un grupo abierto', () => {
    expect(erroresDeLinea(linea({ opcionIds: [101, 201, 202, 203] }))).toEqual([
      'Salsas: elige como máximo 2.',
    ]);
  });

  it('el total de la línea suma extras por cantidad', () => {
    const conExtra = linea({ cantidad: 2, opcionIds: [102, 203] });
    // (20.00 + 5.50 + 3.00) * 2 = 57.00
    expect(totalLineaCents(conExtra)).toBe(5700n);
  });

  it('el total del pedido suma sus líneas', () => {
    const lineas = [linea({ cantidad: 1, opcionIds: [101] }), linea({ cantidad: 2, opcionIds: [102] })];
    // 20.00 + (25.50 * 2) = 71.00
    expect(totalPedidoCents(lineas)).toBe(7100n);
  });
});

describe('elegir opciones respetando el grupo', () => {
  it('en elección única, la nueva opción reemplaza a la anterior', () => {
    expect(alternarOpcion([101], TORTILLA, 102)).toEqual([102]);
  });

  it('en elección única con mínimo 1, tocar la elegida no la quita', () => {
    expect(alternarOpcion([101], TORTILLA, 101)).toEqual([101]);
  });

  it('en grupo abierto, tocar una elegida la quita y no pasa del máximo', () => {
    expect(alternarOpcion([201, 202], SALSAS, 201)).toEqual([202]);
    expect(alternarOpcion([201, 202], SALSAS, 203)).toEqual([201, 202]);
  });

  it('al agregar un producto, la elección única obligatoria ya trae su primera opción', () => {
    expect(opcionesIniciales(producto({ grupos_opcion: [TORTILLA, SALSAS] }))).toEqual([101]);
  });
});

describe('validación del pedido', () => {
  it('sin productos no se envía', () => {
    expect(erroresDePedido(borrador({ lineas: [] }))).toContain('Agrega al menos un producto.');
  });

  it('en una mesa hay que elegirla', () => {
    expect(erroresDePedido(borrador({ destino: 'en_espacio', espacioId: null }))).toContain(
      'Elige la mesa o el espacio.',
    );
  });

  it('pagar al final solo aplica en una mesa', () => {
    expect(erroresDePedido(borrador({ pagoAlFinal: true }))).toContain(
      'Pagar al final solo aplica en una mesa.',
    );
  });

  it('pagar al final y cobrar ahora se excluyen', () => {
    const errores = erroresDePedido(
      borrador({ destino: 'en_espacio', espacioId: 5, pagoAlFinal: true, cobrarAhora: true }),
    );
    expect(errores).toContain('Elige pagar al final o cobrar ahora, no ambos.');
  });

  it('el efectivo recibido no puede ser menor al total', () => {
    // Total de la línea por defecto (Taco con Maíz, sin extra): 20.00
    const errores = erroresDePedido(borrador({ cobrarAhora: true, montoRecibido: '19' }));
    expect(errores).toContain('El efectivo recibido es menor al total del pedido.');
  });

  it('un efectivo recibido igual al total pasa, aunque venga sin centavos', () => {
    expect(erroresDePedido(borrador({ cobrarAhora: true, montoRecibido: '20' }))).toEqual([]);
  });
});

describe('payload del pedido de staff', () => {
  it('para llevar en efectivo: sin espacio, sin nombre y sin campos de cobro', () => {
    const body = construirPedidoStaff(borrador());

    expect(body).toEqual({
      metodo_pago: 'efectivo',
      destino: 'para_llevar',
      espacio_id: null,
      items: [{ producto_id: 1, cantidad: 1, opcion_ids: [101] }],
    });
  });

  it('en una mesa a pagar al final lleva el espacio y la bandera', () => {
    const body = construirPedidoStaff(
      borrador({ destino: 'en_espacio', espacioId: 5, pagoAlFinal: true, nombreCliente: '  Juan ' }),
    );

    expect(body).toMatchObject({
      destino: 'en_espacio',
      espacio_id: 5,
      pago_diferido: true,
      nombre_cliente: 'Juan',
    });
    expect(body).not.toHaveProperty('cobrar_ahora');
  });

  it('cobrar ahora normaliza el monto recibido', () => {
    const body = construirPedidoStaff(borrador({ cobrarAhora: true, montoRecibido: '200' }));
    expect(body).toMatchObject({ cobrar_ahora: true, monto_recibido: '200.00' });
  });

  it('el monto recibido solo viaja con cobrar ahora', () => {
    const body = construirPedidoStaff(borrador({ cobrarAhora: false, montoRecibido: '200' }));
    expect(body).not.toHaveProperty('monto_recibido');
  });

  it('las opciones van ordenadas para que el hash idempotente no dependa del orden de clic', () => {
    const body = construirPedidoStaff(borrador({ lineas: [linea({ opcionIds: [203, 201] })] }));
    expect(body.items[0]?.opcion_ids).toEqual([201, 203]);
  });
});

describe('llave de idempotencia por envío', () => {
  it('reutiliza la llave si el pedido no cambió (reintento seguro)', () => {
    const primera = llaveParaEnvio(null, 'huella-a', () => 'llave-1');
    const reintento = llaveParaEnvio(primera, 'huella-a', () => 'llave-2');

    expect(reintento.llave).toBe('llave-1');
  });

  it('pide una llave nueva si el pedido cambió (reusarla respondería 409)', () => {
    const primera = llaveParaEnvio(null, 'huella-a', () => 'llave-1');
    const editada = llaveParaEnvio(primera, 'huella-b', () => 'llave-2');

    expect(editada.llave).toBe('llave-2');
  });
});
