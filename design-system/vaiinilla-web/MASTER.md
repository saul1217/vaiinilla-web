# Sistema visual maestro — Vaiinilla Web

**Proyecto:** Vaiinilla Web  
**Alcance:** VAI-31 Administración/POS e invitaciones; VAI-32 Super Admin Web  
**Personalidad:** cálida, operativa, precisa y sobria  
**Densidad:** 8/10 para tableros; **movimiento:** 3/10, siempre funcional

## Identidad

| Uso | Color | Token |
| --- | --- | --- |
| Fondo principal | `#F4F0E4` | `--color-cream` |
| Fondo secundario | `#EAE3D3` | `--color-cream-2` |
| Texto principal | `#16150F` | `--color-ink` |
| Superficie oscura | `#2A2820` | `--color-ink-soft` |
| Acción de marca | `#B4E04D` | `--color-lime` |
| Foco e iconos | `#668C16` | `--color-lime-dark` (3.5:1: no usar como texto) |
| Superficie clara | `#FBF9F2` | `--color-white-warm` |
| Texto secundario | `#655F50` | `--color-muted` (4.97:1 sobre `cream-2`) |
| Texto de acento verde | `#4F6C12` | `--color-lime-text` (5.3:1 sobre `cream`; en UI oscura del personal `#BFE06A`) |

- Tipografía: **Poppins**, con `system-ui` como respaldo.
- Iconografía: únicamente Lucide, con trazo consistente. No usar emojis como iconos.
- Administración/POS usa fondos crema; Plataforma usa navegación oscura para distinguir el contexto de autoridad.
- Botones principales redondeados, controles de formulario de 48 px y objetivos táctiles mínimos de 44 px.
- Sombras suaves y bordes cálidos. Evitar efectos decorativos que compitan con datos y acciones.

## Reglas de interacción

- Un solo llamado primario por vista; acciones destructivas separadas y acompañadas por una confirmación explícita.
- Estados de carga, éxito, error, vacío y solo lectura deben ser visibles y explicativos.
- El foco de teclado siempre debe ser visible; el orden de tabulación debe coincidir con el orden visual.
- El color nunca es el único indicador de estado: acompañarlo con texto o icono.
- Transiciones entre 150 y 220 ms, limitadas a opacidad y transformación; respetar `prefers-reduced-motion`.
- Los JWT de contexto no se presentan ni se almacenan en la interfaz.

## Diseño adaptable

- Diseñar primero para 375 px y validar también 768, 1024 y 1440 px.
- Texto base mínimo de 16 px en controles móviles; no desactivar zoom.
- Nunca debe existir desplazamiento horizontal en móvil.
- A partir de 1024 px se usa barra lateral; en pantallas pequeñas se transforma en menú lateral superpuesto.
- Tablas operativas se convierten en tarjetas legibles en móvil.
- Reservar espacio para contenido asíncrono con esqueletos para evitar saltos de diseño.

## Accesibilidad y rendimiento

- Contraste mínimo WCAG AA: 4.5:1 para texto normal.
- Etiquetas visibles en formularios, errores junto al campo y regiones vivas para retroalimentación.
- Enlaces de salto, encabezados secuenciales y cierre claro en diálogos.
- Carga diferida por ruta; no incorporar imágenes o scripts de terceros innecesarios.
- Evitar listas enormes en el cliente: conservar paginación por cursor y filtros del servidor.

## Lista de entrega

- [ ] Flujo completo operable con teclado.
- [ ] Foco visible, etiquetas y mensajes accesibles.
- [ ] Contraste AA y estados no dependientes solo del color.
- [ ] Sin desbordamiento a 375 px.
- [ ] Validado a 375, 768, 1024 y 1440 px.
- [ ] Movimiento reducido respetado.
- [ ] Sin emojis como iconos; Lucide en toda la aplicación.
- [ ] Carga, vacío, error y reintento presentes donde corresponda.


## Deuda técnica de contraste

- Los paneles oscuros de Plataforma/Admin (`.dashboard-card--dark`, `.analytics-kpi--dark`, `.analytics-secondary`, `.cashback-help`, `.invitation-intro`, `.platform-security-note`, `.auth-visual`) usan grises hardcodeados (`#c8c2b5`, `#bdb7aa`, `#cbc5b7`, `#d5cfc1`) sobre `--color-ink`. Hoy leen bien porque esas vistas siempre van en tema claro; se romperían si adoptan el tema oscuro del personal (`--color-ink` pasa a claro). Migrarlos a tokens antes de oscurecerlas.
- `.table-action` solo se renderiza en Invitaciones (Administración, tema claro); no aparece en Cocina, POS ni mesero. El hover sigue con fondos claros fijos (`#edf5dc`, `#fff0ee`): correcto en ese tema, no moverlo al tema oscuro del personal.
- Logo: `/acceso`, `/accesos`, legales y recuperación usan `Logo` en tema claro sobre fondo claro. Plataforma y el splash de acceso de plataforma usan `theme="dark"`. El logo negro del personal solo se sustituye bajo `html[data-staff-ui='nueva']`.
