---
id: r00026
title: "surface default adaptive para clientes MCP normales — native como fallback explícito"
kind: refactor
status: done
type: proposal
track: surface
date: 2026-08-25
plan-parent: q00005
priority: P2
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
    finding: TOK-004
related:
    - r00019 # decisión original: adaptive solo con opt-in privado
    - c00019 # host compatibility matrix + ADR
    - r00025 # integrar tokenTax/latencyTax/historicalSuccess
shipped-in:
    - 58ef6288 # feat(surface): r00026 default adaptive for plain MCP clients
---

# r00026 — surface default adaptive para clientes MCP normales

## Goal

Invertir la política de selección de superficie (`surfaceMode`): para un cliente MCP **ordinario** — uno que **no** declara la capability privada `mcp-vertex/surface` — la superficie por defecto pasa de `native` a `adaptive`. `native` queda como **fallback explícito**: solo se activa vía `--surface=native` en CLI, vía `surfaceMode: native` en `mcp-vertex.config.json`, o vía override de host en la capability privada.

## why

- **El spec MCP no define una capability cliente para negociar `notifications/tools/list_changed`**. Un cliente spec-compliant ya está obligado a tolerarla.
- La política previa (`r00019`, q00004) reservaba `adaptive` para clientes que declarasen la extension privada `mcp-vertex/surface`. En la práctica, ningún host mainstream la declara → todos los clientes MCP ordinarios aterrizaban en `native` (mucho más caro) sin haberlo pedido.
- El `tokens-budget-real` del dashboard mide precisamente el coste de `adaptive` contra el coste histórico de `native`. La política previa hacía que esa métrica nunca reflejase la realidad de los hosts en producción.
- **Riesgo de TOK-004** — un cliente que **no** refresca `tools/list` tras `list_changed` puede quedar aparentemente "sin" la tool recién activada. La defense no se elimina por pasar a `adaptive`: `mcp-vertex_vertex` (router por dominio/acción) y `mcp-vertex_tool_search` permanecen en el **bootstrap set** precisamente para que cualquier tool activada sea alcanzable sin un refresh. El nuevo test e2e *"a client that never refreshes tools/list can still reach an activated tool via the vertex router"* prueba esa propiedad.

## non-goals

- No se cambia la superficie `compact` ni su bootstrap set.
- No se reintroduce `internalOnly:false` en error-reporting.
- No se sube ningún `tokens-budget-real` para hacer pasar un test (R4.1).
- No se añade heurística nueva al privacy validator.
- No se cambia el contrato de la capability privada `mcp-vertex/surface`; sigue siendo opt-in a `adaptive` cuando se declara.
- No se tocan los plugins de business — solo `decideSurfaceModeFromCapabilities` y los harnesses que dependen del default.

## Slices
- global_gate: type

### S1 — Invertir el default de surface para clientes sin capability privada
- **Status**: done
- **Files**: `packages/core/src/lib/surface/decide-mode.ts`
- **Gate**: type
- notes: "Cambia el return de `mode: 'native'` a `mode: 'adaptive'` con reason string ampliado para reflejar la nueva política (r00026 / TOK-004). Mantiene `explicitMode` como override explícito."

### S2 — Pin de `--surface=native` en harnesses que llaman tools por nombre
- **Status**: done
- **Files**: `packages/core/tests/src/lib/e2e/agent-catalog.e2e.spec.ts`, `packages/core/tests/src/lib/e2e/mcp-json-plugin-parity.e2e.spec.ts`, `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`, `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`, `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`, `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts`, `apps/web/scripts/gen-capabilities.ts`
- **Gate**: type
- notes: "Estas suites prueban el wire protocol / listados completos, no la negociación de surface. Pin explícito de `--surface=native` mantiene sus asserts estables y deja `tool-surface.e2e.spec.ts` como el único lugar donde la negociación libre es exercised."

### S3 — Test adversarial: cliente que nunca refresca `tools/list` sigue pudiendo invocar via vertex router
- **Status**: done
- **Files**: `packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`
- **Gate**: type
- notes: "Añade el caso *"a client that never refreshes tools/list can still reach an activated tool via the vertex router"*. Sin `setNotificationHandler` y sin segundo `listTools()` después de activar `memory`. Demuestra que `mcp-vertex_vertex` con `{ domain: 'memory', action: 'save' }` resuelve a `mcp-vertex_memory_save` incluso sin refresh del cliente."

### S4 — Spec: default adaptive para cliente llano
- **Status**: done
- **Files**: `packages/core/tests/src/lib/surface/client-capabilities.spec.ts`
- **Gate**: type
- notes: "El test `negotiates adaptive for a declaring client AND as the default for a plain one` ahora cubre los tres casos: cliente con capability → adaptive; cliente llano → adaptive (default nuevo); cliente llano + `explicitMode: native` → native."

## acceptance

- `decideSurfaceModeFromCapabilities({ capabilities: {} }).mode === 'adaptive'`.
- `decideSurfaceModeFromCapabilities({ capabilities: {} , explicitMode: 'native' }).mode === 'native'`.
- El e2e `defaults an ordinary MCP client (no private capability) to adaptive, not native` pasa.
- El e2e `a client that never refreshes tools/list can still reach an activated tool via the vertex router` pasa.
- `bun run typecheck` verde.
- `bun test packages/core/tests/src/lib/surface/client-capabilities.spec.ts packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` 20/20 verde.
- No se rompe ningún otro e2e suite (la policy queda pinada en los harnesses que no negocian surface).

## resolution

- evidence: 58ef6288 — feat(surface): r00026 default adaptive for plain MCP clients
- tests: 20/20 surface + e2e specs pass; typecheck green
- surface bootstrap set intact: `mcp-vertex_overview`, `mcp-vertex_tool_search`, `mcp-vertex_tool_activate`, `mcp-vertex_tool_deactivate`, `mcp-vertex_vertex`, `mcp-vertex_status`
- tokens: el `tokens-budget-real` ahora mide exactamente la superficie que recibe un host spec-compliant en producción (adaptive por defecto)

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
