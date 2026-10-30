# Personal · slices 2–5

## Referencias y decisiones

Se leyó INVENTARIO.md antes de implementar y se inspeccionaron los originales
I01-tablero, I02-tomar, I03-entregar, I06-partes3, G02-propina10,
J09-caja-admin y L01-oscuro-personal mediante la herramienta de imágenes.
Refero devuelve NO_SUBSCRIPTION; se conserva la dirección fijada por las
referencias del usuario y STAFF-TOKENS.md, sin introducir otra paleta.

| Pantalla | Referencia fijada | Adaptación web |
| --- | --- | --- |
| Mesero / tablero | I01, L01 | Título y números dominantes, tres métricas tonales, mesas de tres columnas en móvil y retícula fluida en escritorio. Libre con contorno; llamada y listo con pares semánticos AA y etiquetas existentes. |
| Tomar pedido | I02 | Fotos reales de `imagen_url`, catálogo de dos columnas; producto seleccionado se expande para cantidades/opciones. En escritorio, catálogo y cliente en columnas; total y envío en pie sticky. Sin inventar buscador ni imágenes. |
| Mesa / entregar | I03 | Resumen de pedido en card tonal, tomar pedido secundario, entregar lima. Hoja móvil y diálogo ancho en escritorio; QR y permisos existentes. |
| Cuenta y abonos | I03, I06 | Lista con importes alineados, saldo destacado, deuda en advertencia. División y métodos con selección invertida, propina en cinco opciones, cobro lima. Se conservan monto/partes, terminal externa, impresión, renta y bloqueo para liberar. |
| Caja / fila y cobro | G02 | Tickets tonales, folio/total más grandes, divisor discontinuo y acciones apiladas. Saldo pendiente y cambio destacados; selección y errores siguen tokens del tema. |
| Sesión | J09 | Card tonal separada de la fila; estado/fondo/fecha actuales y formulario de apertura/cierre conservados. |

No se modificaron llamadas API, cálculos, estados, permisos ni condiciones de
compra/pago. Se conservaron clases existentes y nombres accesibles de acciones;
solo se añadieron clases de presentación y fotografías del catálogo existente.
La preferencia de tema sigue en `html[data-admin-theme]` para todos los roles.
La revisión React se limita a presentación, semántica, claves y carga diferida de
imágenes; no añade efectos, dependencias ni solicitudes de datos.

## Verificación

- TypeScript: correcto.
- Vitest: 56 archivos, 324 pruebas correctas.
- Lint global: mismos 25 errores previos documentados en STAFF-TOKENS.md
  (`e2e/ui-regresion.spec.ts`, `src/pages/invitation-row-menu.test.tsx`,
  `src/types/api.ts`). Lint de los cinco TSX modificados: correcto.
- Contraste calculado con luminancia sRGB de los pares usados: texto/canvas,
  secundario/superficie, CTA y estados semánticos cumplen 4.5:1 en ambos temas.
  Esto verifica pares de tokens, no certifica toda la pantalla renderizada.
- Se intentó Playwright para Mesero/Caja en escritorio y móvil. El servidor
  Vite no puede abrir 127.0.0.1:4173 (`listen EPERM`). Pendiente QA visual
  renderizada a 375/768/1024/1440 y revisión con axe/teclado en un entorno
  con navegador y servidor permitidos. No se generaron capturas finales.
