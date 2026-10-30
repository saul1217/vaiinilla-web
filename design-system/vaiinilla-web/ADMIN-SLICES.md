# Admin · slices 7–10

Reference lock: the supplied iOS inventory and local screenshots are authoritative.
Inspected originals: J01-resumen, J03-pedidos, B10-admin-agotado,
J06-espacios, J08-cashback and J10-flujo. Refero lookup was unavailable
(NO_SUBSCRIPTION). No external visual direction replaces these references.

| Decision | Reference | Adaptation |
| --- | --- | --- |
| Large figures, rounded quiet surfaces, period pills | J01 | Sales lead; existing confirmed-sales semantics and chart access remain |
| Folio and status lead order cards | J03 | Existing history filters, detail and pagination remain |
| Photo-led two-column mobile catalog | B10 | Keep actual publish/hide semantics, text allergens and existing option groups |
| Spacious space cards, QR and clear actions | J06 | Preserve creation, schedule, booking and refund capabilities |
| Separate rule editing and aggregate reports | J08 | Keep existing confirmation; no individual balances |
| Grouped business settings and white QR backing | J10 | Keep actual web settings; exclude school settings |

Implementation: `admin-screens.css`, scoped by additive `admin-screen` and route
classes. Uses existing theme tokens and radii. No API calls, handlers, payment
rules, permissions or test hooks change. Desktop uses existing shell and grids;
mobile catalog categories scroll horizontally and product cards use two columns.
Existing theme selection applies to every role; this slice only styles Admin routes.

Validation: TypeScript and 324 unit tests passed. Full lint reports existing
errors in ui-regresion.spec.ts, invitation-row-menu.test.tsx and types/api.ts;
these files are outside this slice. Browser verification was blocked by EPERM
when binding Vite to 127.0.0.1:4173. Responsive and accessibility browser checks
therefore remain unverified; do not treat token contrast as a full WCAG audit.
