---
id: f00269
title: "Plugin states: UNLOADED / LOADED_HIDDEN / ACTIVE / DENIED"
kind: feat
status: ready
type: proposal
track: lifecycle
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track D / f00269"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00268 # lifecycle phases (prerequisito)
    - c00134 # métricas de lifecycle (Track D)
    - f00188 # capability enforcement (Track F)
shipped-in: ["4162e9ab8"]
---

# f00269 — Plugin states: UNLOADED / LOADED_HIDDEN / ACTIVE / DENIED

## Goal

Introducir una máquina de estados explícita para cada plugin en el
grafo del host, con cuatro estados canónicos y transiciones
controladas: `UNLOADED`, `LOADED_HIDDEN`, `ACTIVE`, `DENIED`. Hoy el
estado del plugin es implícito en flags booleanos dispersos en el
router y el plugin manager.

### Comportamiento actual

- El estado de un plugin se infiere de varios flags:
  `isRegistered`, `isHidden`, `isDisabled`, `hasCapabilities`,
  `manifest` en cache, etc.
- No hay una API unificada para "ocultar temporalmente", "desactivar",
  "descargar" o "denegar".
- El router a veces invoca plugins que no deberían invocarse porque
  el flag `disabled` se chequea después de `tools/list`.

### Comportamiento deseado

- Cuatro estados canónicos:
  - `UNLOADED`: plugin descubierto pero ni siquiera preparado.
  - `LOADED_HIDDEN`: `prepare()` ejecutado, no aparece en
    `tools/list`. Útil para plugins en sombra (shadow plugins) que
    validan manifest.
  - `ACTIVE`: `activate()` ejecutado, capabilities concedidas,
    aparece en `tools/list`, responde invocaciones.
  - `DENIED`: plugin al que la policy denegó capacidades; absorbe
    transiciones (no puede pasar a `ACTIVE` sin reset).
- Transiciones:
  - `UNLOADED → LOADED_HIDDEN` con `prepare()`.
  - `LOADED_HIDDEN → ACTIVE` con `activate()`.
  - `ACTIVE → UNLOADED` con `dispose()`.
  - Cualquier estado → `DENIED` por policy (Track F, `f00188`).
  - `DENIED` es **absorbente**: requiere reset manual del grafo.

## why

- La auditoría externa (§12) lo señala: la ausencia de estados
  explícitos produce bugs donde un plugin "desactivado" igual
  responde a invocaciones.
- Habilita métricas precisas (`c00134`): el contador
  `plugin.loaded` cuenta transiciones `→ LOADED_HIDDEN`, etc.
- Habilita el patrón "shadow plugin" sin hacks: un plugin
  `LOADED_HIDDEN` puede validar manifests de otros plugins sin
  aparecer al LLM.
- La transición a `DENIED` queda registrada explícitamente, lo que
  ayuda al debugging.

## non-goals

- No introduce un concepto de "suspendido" (pausa temporal) en
  esta iteración — se puede añadir después si hace falta.
- No cambia la persistencia de plugins entre arranques del host.
- No fuerza a los plugins actuales a usar la nueva API; el router
  expone getters para `state` y el plugin legacy arranca en
  `ACTIVE` directamente.

## architecture

### 1. Estado y transiciones

- `packages/core/src/lib/plugins/states.ts`:
  ```ts
  type PluginState =
    | 'UNLOADED'
    | 'LOADED_HIDDEN'
    | 'ACTIVE'
    | 'DENIED';

  interface PluginStateMachine {
    current: PluginState;
    transition(to: PluginState, reason: TransitionReason): void;
    canTransition(to: PluginState): boolean;
  }
  ```
- Tabla de transiciones válidas:
  ```ts
  const VALID: Record<PluginState, PluginState[]> = {
    UNLOADED: ['LOADED_HIDDEN', 'DENIED'],
    LOADED_HIDDEN: ['ACTIVE', 'UNLOADED', 'DENIED'],
    ACTIVE: ['UNLOADED', 'DENIED'],
    DENIED: [], // absorbente
  };
  ```

### 2. Integración con el router

- `packages/core/src/lib/plugins/router.ts` mantiene un
  `Map<PluginId, PluginStateMachine>`.
- `tools/list` filtra plugins cuyo `state !== 'ACTIVE'`.
- `tools/call` verifica `state === 'ACTIVE'` antes de delegar.
- Eventos: transición observada por la métrica
  `plugin.state.transition` (Track D, `c00134`).

### 3. API de control

- `pluginManager.hide(pluginId)` → `UNLOADED → LOADED_HIDDEN` o
  `ACTIVE → LOADED_HIDDEN`.
- `pluginManager.activate(pluginId)` → `LOADED_HIDDEN → ACTIVE`.
- `pluginManager.unload(pluginId)` → a `UNLOADED` con `dispose()`.
- `pluginManager.deny(pluginId, reason)` → cualquier estado →
  `DENIED` con reason registrada.

### 4. Tests

- `packages/core/tests/src/lib/plugins/states.spec.ts`:
  - Transiciones válidas pasan; inválidas lanzan error tipado.
  - `DENIED` es absorbente.
  - `tools/list` excluye plugins no `ACTIVE`.
  - `tools/call` devuelve `refusal` tipado para plugins no
    `ACTIVE`.
  - Eventos de transición se emiten.

## Slices

### S1 — Máquina de estados + integración con router

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/states.ts`, `packages/core/src/lib/plugins/router.ts`, `packages/core/src/lib/plugins/plugin-manager.ts`, `packages/core/tests/src/lib/plugins/states.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-f00269-review-fix
- review-reviewer: copilot-f00269-independent-reviewer
- review-log: requested_changes by delivery_verifier — REQUEST_CHANGES: activate() falla tras unload porque intenta UNLOADED -> ACTIVE, transición prohibida. Además hide() antes de initialize puede crear estado ACTIVE implícito y fallar ACTIVE -> LOADED_HIDDEN; debe converger desde UNLOADED o rechazar explícitamente. Añadir tests de regresión para ambos casos y mantener typecheck/tests verdes.
- review-log: approved by copilot-f00269-independent-reviewer — Validadas transiciones pre-initialize, rechazo de IDs desconocidos, unload->activate y DENIED absorbente.
## acceptance

- Cuatro estados implementados con tabla de transiciones.
- `tools/list` filtra por estado.
- `tools/call` rechaza plugins no `ACTIVE` con refusal tipado.
- Eventos de transición disponibles para métricas.
- Tests cubren todas las transiciones + invariantes.
- `bun run validate` verde.
