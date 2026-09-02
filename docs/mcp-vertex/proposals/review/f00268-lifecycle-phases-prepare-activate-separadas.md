---
id: f00268
title: "Lifecycle phases: `prepare()` / `activate()` separadas"
kind: feat
status: review
type: proposal
track: lifecycle
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track D / f00268"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00269 # plugin states (consume el resultado de activate)
    - f00188 # capabilities se conceden en activate (Track F)
last-transition-id: c7ced51d-bbd2-4fa0-906e-db455d1ed3e6
last-correlation-id: c7ced51d-bbd2-4fa0-906e-db455d1ed3e6
last-transition-from: in-progress
---

# f00268 — Lifecycle phases: `prepare()` / `activate()` separadas

## Goal

Introducir fases de lifecycle explícitas para plugins: `prepare()`
(side-effect-free) → `activate()` (donde se conceden capabilities)
→ `dispose()` (cleanup). Hoy el ciclo se mezcla en una sola fase
`register()` que ejecuta side effects y asume capacidades sin
separación clara.

### Comportamiento actual

- `packages/core/src/lib/plugins/lifecycle.ts` (o equivalente) define
  un solo punto de entrada `register(ctx)` donde el plugin hace
  todo: validar config, registrar tools, configurar listeners,
  reservar recursos.
- No hay forma de que un plugin sea cargado sin side effects para
  validar su `manifest` o enumerar capacidades.
- La auditoría externa (§10) lo marca como acoplamiento: la fase de
  "ser cargado en el grafo" no está separada de la fase de "tener
  capabilities activas".

### Comportamiento deseado

```ts
interface PluginLifecycle<P, A> {
  /** Side-effect-free. Devuelve un objeto serializable con la
   *  configuración parseada y normalizada. */
  prepare(ctx: PrepareContext): Promise<PreparedPlugin<P>>;

  /** Aquí se conceden capabilities. Devuelve el plugin listo para
   *  registrar tools y manejar invocaciones. */
  activate(
    prepared: PreparedPlugin<P>,
    ctx: ActivateContext
  ): Promise<ActivePlugin<A>>;

  /** Cleanup. Reversible. */
  dispose(active: ActivePlugin<A>): Promise<void>;
}
```

- `prepare()` puede invocarse en CI / validación de manifests sin
  arrancar el plugin.
- `activate()` solo se llama tras el `prepare()` exitoso.
- `dispose()` debe ser idempotente.
- El router actual (`packages/core/src/lib/plugins/router.ts`)
  adapta el patrón antiguo al nuevo (compatibilidad aditiva).

## why

- Habilita que `f00188` (Track F, capability schema) conceda
  capabilities solo en `activate()`, no en `prepare()`.
- Habilita validación de manifests en CI (sin side effects).
- Habilita tests deterministas: `prepare()` es puro, se puede probar
  sin mocks.
- Habilita `f00269` (plugin states): el estado `LOADED_HIDDEN`
  corresponde a un plugin que terminó `prepare()` pero no
  `activate()`.

## non-goals

- No elimina el patrón `register()` actual; se mantiene con un
  adapter que internamente llama `prepare` + `activate`.
- No cambia el modelo de manifests.
- No obliga a todos los plugins existentes a migrar de inmediato.
- No introduce un sistema de eventos en `prepare()`.

## architecture

### 1. Nuevos tipos en `packages/core/src/lib/plugins/lifecycle.ts`

- `PreparedPlugin<P>` — tipo genérico que el plugin define para su
  payload post-`prepare()`.
- `ActivePlugin<A>` — tipo genérico para el payload post-`activate()`.
- `PrepareContext` — incluye `manifest`, `configResolved`,
  `logger`, `metrics`, pero **no** capabilities.
- `ActivateContext` — incluye `PrepareContext` + las capabilities
  concedidas (`ctx.capabilities.git.write(...)`).

### 2. Adapter de compatibilidad

- `definePlugin({ register(ctx) { ... } })` se sigue aceptando.
- Internamente, `definePlugin` envuelve `register` para producir un
  plugin con `prepare = () => ({})` y `activate = register`.
- Los plugins que declaren `prepare/activate` directamente usan la
  nueva API.

### 3. Router

- `packages/core/src/lib/plugins/router.ts` actualiza el boot:
  1. Cargar manifest.
  2. `prepare()` cada plugin.
  3. Resolver capabilities (Track F).
  4. `activate()` cada plugin.
  5. Exponer tools.

### 4. Tests

- `packages/core/tests/src/lib/plugins/lifecycle.spec.ts`:
  - Plugin que solo define `prepare` no expone tools.
  - Plugin con `prepare` + `activate` registra tools en el orden
    correcto.
  - `prepare()` que lanza → `activate()` no se llama.
  - `activate()` que lanza → `dispose()` se llama sobre plugins
    ya activados.
  - `dispose()` idempotente (segunda llamada no-op).

## Slices

### S1 — Tipos `prepare/activate/dispose` + adapter de compatibilidad

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/lifecycle.ts`, `packages/core/src/lib/plugins/router.ts`, `packages/core/tests/src/lib/plugins/lifecycle.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: Cartago
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: lifecycle prepare/activate/dispose y el adaptador de compatibilidad están cubiertos por 10/10 tests focalizados; el typecheck de packages/core pasa con salida 0.
## acceptance

- API `prepare/activate/dispose` documentada y exportada.
- Adapter para plugins con `register()` legacy.
- Tests cubren: éxito, fallo en `prepare`, fallo en `activate`,
  rollback de activaciones previas, `dispose` idempotente.
- Plugins existentes siguen funcionando sin cambios.
- `bun run validate` verde.

## Notes

### Reopened 2026-09-01

Independent re-verification found the S1 review-log's "10/10 tests +
typecheck green" claim true but insufficient — it verified the
`lifecycle.ts` module in isolation and never checked that it is
actually wired into the plugin boot path, which is what the
proposal's own architecture section and Files list (which names
`router.ts`) require:

- `packages/core/src/lib/plugins/router.ts` still calls
  `entry.plugin.register(...)` exclusively (line 361) and contains
  zero references to `prepare`, `activate`, or `lifecycle` —
  confirmed via `grep -n "prepare\|activate\b"
  packages/core/src/lib/plugins/router.ts` (no matches). The
  "Router" section of this proposal's architecture explicitly
  requires the boot sequence to become
  `prepare() → resolve capabilities → activate()`; that never
  happened.
- The described "adapter de compatibilidad" —
  `definePlugin({ register(ctx) {...} })` wrapped internally into
  `prepare = () => ({})` / `activate = register` — does not exist.
  The real `definePlugin` in
  `packages/core/src/lib/plugins/plugin-contract.ts:486` is
  `export const definePlugin = (plugin: IMcpPlugin): IMcpPlugin =>
  plugin;` — a pure passthrough with no lifecycle translation.
- `grep -rln "PreparedPlugin\|ActivePlugin\|IPluginLifecycle"
  packages plugins --include="*.ts"` (excluding lifecycle.ts/spec)
  turns up nothing relevant — every other `ActivePlugin` hit is an
  unrelated pre-existing "list of active plugins" concept, not this
  contract's type.
- `lifecycle.ts` itself was first added by an earlier, unrelated
  commit (`1e432f998 feat(lifecycle): f00184 + f00185 + c00134 —
  Track D`), not by work done for f00268; f00268's S1 appears to
  have pointed at that pre-existing, still-orphaned module rather
  than completing the router integration it claims.

Net effect: the 10 focused tests genuinely pass and typecheck is
green, but the actual behavior this proposal exists to deliver — a
router that boots plugins through `prepare()` then `activate()`, and
a `definePlugin` adapter that lets legacy `register()` plugins
participate — is not present anywhere in production code. Reopening
S1 as pending. To close for real: wire `router.ts` to call
`prepare()`/`activate()` per plugin (or explicitly narrow the
acceptance/architecture text if the router integration is being
deferred to a later proposal), and make `definePlugin` actually
perform the `register` → `prepare`/`activate` translation described
in architecture §2.
