# Mesero: lo que necesita el backend

Contrato que la web ya usa (`src/lib/mesero-api.ts`). Android e iOS no entran en esta fase.
Todo sigue las convenciones actuales: sobre `{ data, meta, error }`, token de contexto de 15 min,
`Idempotency-Key` (UUID) en escrituras, `version_esperada` para concurrencia, RLS por establecimiento.

## Qué ya existe y se reutiliza

| Qué | Endpoint | Nota |
|---|---|---|
| Rol `mesero` | `utils/roles.js` | Invitación por `personal-invitaciones` ya lo acepta. |
| Contexto de mesero | `POST /sesiones/contexto` con `membresia_id` | La web lo pide con el ID token de Firebase. |
| Mesas del establecimiento | `GET /espacios` | La web lo usa como respaldo del tablero. |
| Pedidos listos en mesa | `GET /pedidos?estado=listo` | Con rol mesero ya filtra `listo` + `en_espacio`. |
| Entregar | `POST /pedidos/:id/transiciones` `{estado_objetivo:'entregado', version_esperada, qr_token}` | El mesero escanea el QR del cliente. |
| Push a meseros | `notifications.service` `staff_alert` `listo_mesero` | Se agrega `llamada_mesa`. |

## Lo nuevo

### 1. Tabla `llamadas_mesa`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `establecimiento_id` | uuid fk | RLS igual que `pedidos`. |
| `espacio_id` | int fk `espacios` | |
| `usuario_id` | uuid fk | Quien llamó (cliente). |
| `pedido_id` | uuid fk null | Pedido desde el que llamó, si hay. |
| `motivo` | enum `atencion`, `utensilios`, `problema` | |
| `estado` | enum `pendiente`, `en_camino`, `atendida`, `cancelada`, `expirada` | |
| `tomada_por` | uuid fk usuarios null | Mesero que dijo "Voy". |
| `creado_en`, `tomada_en`, `cerrada_en` | timestamptz | |
| `version` | int | Empieza en 1, sube en cada transición. |

Índice único parcial: **una llamada abierta por espacio**
`UNIQUE (espacio_id) WHERE estado IN ('pendiente','en_camino')`.

### 2. Forma de una llamada (`TableCall`)

```json
{
  "id": "0b7f…",
  "espacio": { "id": 4, "nombre": "Mesa 4", "tipo": "mesa" },
  "pedido_id": "9a1e…",
  "motivo": "utensilios",
  "estado": "pendiente",
  "cliente": { "nombre": "Ana" },
  "tomada_por": null,
  "creado_en": "2026-09-25T18:02:11Z",
  "tomada_en": null,
  "cerrada_en": null,
  "version": 1
}
```

`tomada_por` cuando existe: `{ "usuario_id": "…", "nombre": "Luis" }` (el cliente ve el nombre).

### 3. Endpoints

**Cliente**

- `POST /api/v1/espacios/{espacioId}/llamadas` — rol `cliente`. Body `{ motivo, pedido_id? }`. `Idempotency-Key` obligatorio.
  - `201` con `TableCall` nueva.
  - `200` con la llamada abierta existente si ya hay una en ese espacio (se une, no duplica).
  - `403 NO_ACTIVE_ORDER_IN_SPACE` si el cliente no tiene un pedido `en_espacio` de hoy en ese espacio (activo o entregado hace menos de 2 h).
  - `422 SPACE_NOT_ACTIVE` si el espacio está inactivo.
  - `429 RATE_LIMITED` con `Retry-After` si llamó hace menos de 60 s (por usuario + espacio).
- `GET /api/v1/llamadas?estado=pendiente,en_camino` — con rol `cliente` devuelve solo las suyas. La web lo usa para recuperar el estado al recargar.
- `POST /api/v1/llamadas/{id}/cancelaciones` — rol `cliente`, dueño, desde `pendiente` o `en_camino`. `201` con la llamada `cancelada`.

**Mesero** (también `cajero` y `admin`)

- `GET /api/v1/llamadas?estado=pendiente,en_camino` — todas las del establecimiento, más viejas primero.
- `POST /api/v1/llamadas/{id}/transiciones` — body `{ estado_objetivo: 'en_camino' | 'atendida', version_esperada }`.
  - `pendiente → en_camino` guarda `tomada_por` y `tomada_en`.
  - `en_camino → atendida` y `pendiente → atendida` guardan `cerrada_en`.
  - `409 VERSION_CONFLICT` si otro mesero ya la tomó; la web recarga y la quita.
- `GET /api/v1/espacios/tablero` — una sola llamada para pintar el tablero:

```json
[
  {
    "espacio": { "id": 4, "nombre": "Mesa 4", "tipo": "mesa" },
    "llamada": { "…TableCall o null…": null },
    "pedidos": [
      {
        "id": "9a1e…", "folio": 312, "estado": "listo", "version": 3,
        "cliente": { "nombre": "Ana" },
        "items_resumen": "2× Taco de cochinita, 1× Agua de jamaica",
        "actualizado_en": "2026-09-25T18:01:40Z"
      }
    ]
  }
]
```

`pedidos`: los `en_espacio` de la fecha operativa en `por_cobrar`, `cobrado`, `preparando` o `listo`. Todos los espacios activos aparecen, aunque estén libres.

### 4. Avisos push (FCM, ya existe `device_tokens`)

- A meseros del establecimiento: `type: 'staff_alert'`, `alert: 'llamada_mesa'`, con `llamada_id`, `espacio_nombre` y `motivo`. Título: "Mesa 4 te llama". Cuerpo según motivo: "Necesita atención" / "Pide cubiertos o servilletas" / "Algo está mal con su pedido".
- Al cliente cuando pasa a `en_camino`: `type: 'mesero_en_camino'`, con `llamada_id` y `mesero_nombre`.

### 5. Vencimiento

- `pendiente` por más de 10 min pasa a `expirada`.
- `en_camino` por más de 10 min pasa a `atendida` sola.
- Se puede aplicar al leer (en `GET /llamadas` y `GET /espacios/tablero`) más un job cada minuto.

### 6. Pruebas mínimas

- Dos clientes de la misma mesa llaman: una sola llamada abierta.
- Dos meseros toman la misma llamada: uno recibe `409`.
- Cliente de otra mesa no puede llamar a esa mesa (`403`).
- RLS: un mesero de otro establecimiento no ve ni transiciona llamadas ajenas.
- `Retry-After` en el segundo intento antes de 60 s.

## Cómo se comporta la web mientras esto no existe

- **Mesero** (`/mesero`): arma el tablero con `GET /espacios` + `GET /pedidos?estado=listo`, y entregar ya funciona con el QR. Si `/espacios/tablero` o `/llamadas` responden 404, muestra un aviso de que las llamadas aún no están activas.
- **Cliente**: el botón "Llamar al mesero" aparece en pedidos para mesa. Si el endpoint responde 404, avisa que la función todavía no está disponible en esta cafetería, sin romper nada.
- **Pruebas sin backend**: `/__qa/mesero` (solo en desarrollo) muestra el tablero con datos de ejemplo y todas las acciones.
