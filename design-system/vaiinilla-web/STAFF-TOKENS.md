# Personal · sistema iOS, slice 1

Referencia principal: `ios-2026-10-28/I01-tablero.png` y
`L01-oscuro-personal.png`; acciones y papel: `B04-cocina.png`.
Inventario: `/workspace/vaiinilla-pm/ui-movil/INVENTARIO.md`.
Las capturas se inspeccionaron con la herramienta de imagen. La investigación
complementaria en Refero no estuvo disponible (NO_SUBSCRIPTION).

## Decisiones y referencia fijada

| Decisión | Evidencia / propósito |
| --- | --- |
| Crema y carbón, superficies tonales | I01 / L01: conservar calidez y profundidad sin blanco puro |
| Selección invertida, lima para CTA | I01 / L01 / B04: separar navegación de acciones |
| Títulos pesados y cifras legibles | I01: jerarquía operativa; conservar Poppins web, sin atribuirla a iOS |
| Cards 20px, hojas 28px, controles 16px | Estimaciones del inventario adaptadas a CSS px |
| Hoja inferior en móvil; diálogo centrado en escritorio | Patrón iOS adaptado al espacio disponible; conservar Radix y foco |
| Estados con texto y paletas semánticas | Contraste AA y reconocimiento sin depender del color |

No incorporar tab bar de cliente, ilustraciones, funciones o flujos ausentes.
No modificar permisos ni cobro: los clientes pagan al final.

## Tokens de color

Selector único: `html[data-admin-theme="claro"|"oscuro"]`. La elección
existente se conserva para Mesero, Caja, Cocina y Admin.

| Token | Claro | Oscuro |
| --- | --- | --- |
| `--color-cream` canvas | #F4F1E7 | #1D1E1C |
| `--color-cream-2` superficie secundaria | #E9E6DA | #292A27 |
| `--color-white-warm` superficie elevada | #F8F5EC | #292A27 |
| `--color-ink` texto | #171817 | #F5F1E5 |
| `--color-muted` texto secundario | #626257 | #B1B0A5 |
| `--color-lime` CTA | #B9D86D | #B9D86D |
| `--on-accent` texto CTA | #171817 | #171817 |
| `--line` separador decorativo | #D2CEC0 | #434441 |
| `--line-strong` contorno de control | #7F7F73 | #85867B |
| `--focus-ring` foco | #526D21 | #B9D86D |
| éxito fondo / texto | #DDE8BC / #354D10 | #303D23 / #C9E795 |
| pendiente fondo / texto | #F8DE87 / #604400 | #44391E / #F8DE87 |
| peligro fondo / texto | #F4D8D0 / #92291F | #482C29 / #FFB2A5 |
| información fondo / texto | #DCE8ED / #254E63 | #263B44 / #B5DCEB |
| neutral fondo / texto | #E9E6DA / #57574C | #353630 / #DEDBCF |

Los separadores son decorativos; usar `line-strong` en campos y controles.
El acento siempre lleva tinta oscura incluso en tema oscuro.
Toast: #171817 con texto #F5F1E5 en ambos temas.

## Escalas y componentes

- Familia: Poppins con respaldo de sistema existente. Cuerpo/campos 16px,
  caption/badge 12px, título fluido 28–36px y peso 850.
- Espaciado `--space-{1,2,3,4,5,6,8}`: 4/8/12/16/20/24/32px.
- Radios: control 16px, card 20px, sheet 28px, pill 999px.
- Sombras claras: pequeña 0 4px 16px al 5%; elevada 0 16px 40px al 10%.
  Oscuro conserva sombras negras existentes. CTA sin resplandor permanente.
- Botones/campos 48px; chips y navegación mínimo 44px. Badge informativo 28px.
- `Button`, `Field`, `SelectField`, `Feedback`, `Modal`, `PageHeader` conservan
  API y clases. Button comunica carga con `aria-busy`.
- `status-badge` conserva etiquetas y modificadores. Sin cobrar usa advertencia,
  cancelado usa peligro; no confundir deuda con error.
- Shell conserva sidebar desde 1024px y menú superpuesto móvil; añade nombre
  del establecimiento y rol al encabezado móvil. No añade rutas ni acciones.
- Modal bajo 640px se ancla abajo con agarradera decorativa y safe area;
  por encima se mantiene centrado. Scroll interno y cierre/foco de Radix.
- Movimiento reducido: conservar reglas globales existentes.

La base se aplica a pantallas actuales; el rediseño específico de tableros,
comandas, catálogo y cuentas queda en sus slices posteriores.

## Validación de esta entrega

- `npx tsc -b`: correcto.
- `npx vitest run`: 56 archivos, 324 pruebas correctas.
- Lint de `ui.tsx` y `app-shell.tsx`: correcto. `npm run lint` global:
  25 errores en archivos no modificados (`e2e/ui-regresion.spec.ts`,
  `src/pages/invitation-row-menu.test.tsx`, `src/types/api.ts`).
- Cálculo sRGB WCAG de texto/canvas, secundario/superficie, CTA y cinco
  pares semánticos: mínimo 4.93:1 claro y 6.61:1 oscuro. Esto valida tokens,
  no certifica todas las composiciones de pantallas especializadas.
- QA visual responsive pendiente: servidor Vite rechazado con EPERM en
  127.0.0.1:4173; Chromium también rechazado por el entorno al iniciar.
  No se afirma validación visual a 375/768/1024/1440.
