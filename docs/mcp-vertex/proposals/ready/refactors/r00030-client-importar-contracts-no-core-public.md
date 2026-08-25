---
id: r00030
title: "`@mcp-vertex/client`: importar de `contracts`, no de `core/public`"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00030"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00029 # extraer @mcp-vertex/contracts (prerequisito)
    - r00028 # subpath exports de core
---

# r00030 — `@mcp-vertex/client`: importar de `contracts`, no de `core/public`

## Goal

Eliminar del cliente (`packages/client/src/**`) toda importación que
arrastre la superficie amplia de `@mcp-vertex/core` cuando en
realidad solo necesita tipos. Después de esta hija, los tipos puros
vienen de `@mcp-vertex/contracts`, y solo el runtime del cliente
importa de `@mcp-vertex/core`.

### Comportamiento actual

- `packages/client/src/**/*.ts` contiene decenas de imports del
  estilo:
  ```ts
  import type { PluginManifest, OperationResult } from '@mcp-vertex/core';
  import { SomeRuntimeHelper } from '@mcp-vertex/core';
  ```
- El barrel `"."` de `@mcp-vertex/core` re-exporta todo, así que
  incluso `import type` arrastra el grafo de compilación entero.
- Bundle size del cliente se infla innecesariamente.

### Comportamiento deseado

- Imports de tipos puros → `@mcp-vertex/contracts`.
- Imports de runtime → `@mcp-vertex/core/plugin`,
  `@mcp-vertex/core/runtime` o `@mcp-vertex/core/node` (subpaths
  introducidos por `r00028`).
- Solo donde realmente se necesite el barrel completo, se sigue
  usando `@mcp-vertex/core`.
- Lint arquitectónico verifica que no se reintroduce el patrón.

## why

- Reduce bundle size del cliente de forma medible
  (R4.6 — antes/después con tabla medible).
- Hace al cliente **independiente del runtime del core** para sus
  tipos: si en el futuro alguien refactoriza `core`, el cliente no
  se rompe.
- La auditoría externa (§23) llama a este acoplamiento "client
  arrastra core/public por un barrel transitivo".
- Habilita que el cliente sea publicable independientemente como
  SDK para terceros que solo quieren tipos.

## non-goals

- No refactoriza plugins (eso es scope de Tracks D, F, etc.).
- No elimina APIs de `@mcp-vertex/core` (solo deja de consumirlas
  desde el cliente).
- No introduce nuevos tipos — solo cambia la fuente.
- No cambia comportamiento observable del cliente.

## architecture

### 1. Inventario de imports

- `tools/scripts/inspect/client-imports.script.ts` (one-shot):
  - Recorre `packages/client/src/**`.
  - Clasifica cada import:
    - `type-only`: debe ir a `@mcp-vertex/contracts`.
    - `runtime`: debe ir a un subpath (`/plugin`, `/runtime`,
      `/node`).
    - `core (full barrel)`: solo cuando realmente haga falta.
  - Emite reporte antes/después.

### 2. Migración

- Cambio mecánico por archivo:
  ```ts
  // antes
  import type { PluginManifest } from '@mcp-vertex/core';
  // después
  import type { PluginManifest } from '@mcp-vertex/contracts';
  ```
- Imports de runtime se cambian a subpaths:
  ```ts
  // antes
  import { definePlugin } from '@mcp-vertex/core';
  // después
  import { definePlugin } from '@mcp-vertex/core/plugin';
  ```

### 3. Lint arquitectónico

- `tools/scripts/lint/no-core-public-types-in-client.script.ts`:
  - Escanea `packages/client/src/**`.
  - Falla si encuentra `import type { ... } from '@mcp-vertex/core'`
    para símbolos que `@mcp-vertex/contracts` exporta.
  - Whitelist explícita para símbolos que aún no se han movido.

### 4. Tests

- El propio script de lint sirve como test.
- Smoke test: `bun build packages/client` produce bundle sin
  imports a `@mcp-vertex/core/public`.

### 5. Medición before/after

- Antes:
  - Tamaño del bundle compilado del cliente.
  - Número de símbolos importados de `@mcp-vertex/core`.
  - Tiempo de tree-shaking.
- Después:
  - Mismas métricas.

## Slices

### S1 — Migrar imports de tipos puros a `@mcp-vertex/contracts`

- **Status**: pending
- **Files**: `packages/client/src/**/*.ts` (todos los `import type` de `@mcp-vertex/core` hacia `contracts`), `tools/scripts/inspect/client-imports.script.ts`, `tools/scripts/lint/no-core-public-types-in-client.script.ts`
- **Gate**: type

## acceptance

- Cero `import type { ... } from '@mcp-vertex/core'` en
  `packages/client/src/**` para tipos que ya existen en
  `@mcp-vertex/contracts`.
- Bundle size decrece (medición documentada).
- Lint pasa en CI.
- `bun run validate` verde.
- Comportamiento del cliente idéntico.
