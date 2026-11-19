# Novedades del 16 nov 2026 (equipo «ultra y David»)

Esta nota es para los agentes y las personas que trabajan en este repo. El 16 nov el equipo «ultra y David» (Kao) juntó 27 PR a `develop`. Todos son de `winkakao3-dev`, todos van con merge y no se reescribió el historial. Si encuentras pantallas o rutas nuevas, o banderas prendidas, salen de aquí. No son un error.

## Banderas que se prendieron en `develop`

Se prendieron después de probarlas contra development:

- `AGENDA_ENABLED`, `REPARTO_ENABLED`, `INVENTARIO_ENABLED`, `SIN_INTERNET_ENABLED`, `WALLET_CAJA_ENABLED`, `SCHOOL_ADMIN_ENABLED` y `BOWLING_ADMIN_ENABLED`.
- En `src/lib/features.ts`: `CASHBACK_ENABLED`, `CORTES_REPORTE_ENABLED` e `IA_CONFIG_ENABLED`.

Siguen apagadas: `HOTEL_ADMIN_ENABLED` y `HOTEL_STAFF_ENABLED` (del PR #166, 13 nov). El pago mixto del POS sigue dependiendo de `VITE_POS_MIXED_PAYMENTS_ENABLED`.

## Los PR

| PR | Qué trae |
|---|---|
| #159 | Agenda: una Idempotency-Key por modal, reembolso real y pruebas de cancelación |
| #171 | Vercel: solo `main` y `develop` despliegan |
| #172 | Caja: movimientos del cajón y último cierre (Doop N11) |
| #173 | Caja: buscar un pedido de la fila (Doop N05) |
| #174 | Cortes: se prenden, Caja ve su corte y el admin descarga el CSV |
| #175 | Mi turno para Caja, Mesero y Cocina (Doop N07) |
| #176 | Saldo de clientes en Caja |
| #177 | Agenda, y la barra móvil del personal con más de cuatro destinos |
| #178 | Reparto y encargos |
| #179 | Boliche; «Pistas» solo aparece en un boliche |
| #180 | Escuela: panel del admin |
| #181 | Inventario y sin internet |
| #182 | Asistente de configuración y Cashback |
| #183 | Cocina: deshacer «lista», ¿Qué se acabó?, Para mañana y aviso de insumos |
| #184 | Mesero: abrir cuenta, turno de cancha sin renta, «Cuenta $…» y Atendida directo |
| #185 | Caja: devoluciones |
| #186 | Caja › Alumnos sin teléfono: cobrar del saldo con PIN y tope, entregar y credencial QR o NFC |
| #187 | Manual «Paso a paso» de Caja, Cocina y Mesero |
| #188 | Caja del dueño: último cierre detallado y sesión abierta |
| #189 | Menú: «Sugerir alérgenos» con el asistente |
| #190 | Inventario: insumos, entradas, mermas, ajustes, conteo de fin de turno y «Lo usan» |
| #191 | Inventario: historial, reporte por periodo, asistente y avisos |
| #192 | Asistente de la tienda: contesta como trabajo en segundo plano, como en Expo |
| #193 | Entrar con Google en Administración y POS |
| #194 | README: rutas nuevas y banderas prendidas |
| #195 | Dependencias menores: React 19.3, react-hook-form, user-event y acciones de CI |
| #196 | Menú: archivar y restaurar productos y categorías vacías |

El detalle de las rutas y las banderas está en el `README.md`.

## Por qué

La meta es que la web del personal haga lo mismo que la app de Expo. Lo que todavía falta: el hotel (escrito, pero apagado), los roles del hotel grande, proveedores en el asistente de inventario e importar listas de Excel.

## Si algo falla

Puedes revertir lo que haga falta. Si lo haces, deja la aclaración en el commit del revert o en el PR: qué falló, cómo lo viste y qué PR revertiste. Así podemos arreglarlo y volver a meterlo. Si tienes dudas, avisa a Kao (`winkakao3-dev`) o comenta en el PR que corresponde.
