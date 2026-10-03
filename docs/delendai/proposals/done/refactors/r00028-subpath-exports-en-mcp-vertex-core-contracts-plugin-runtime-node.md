---
id: r00028
title: "Subpath exports en `@mcp-vertex/core`: `/contracts`, `/plugin`, `/runtime`, `/node`"
kind: refactor
status: done
type: proposal
track: architecture
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00028"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00027 # inventario necesario para decidir qué entra en cada subpath
    - r00029 # extraer @mcp-vertex/contracts es prerequisito lógico
    - r00030 # cliente importa de contracts
    - d00012 # ADR 0007 documenta esta decisión (subpath, no paquete)
shipped-in: ["10bb11612"]
last-transition-id: 911c30cd-780f-4c46-8823-1823195c67bd
last-correlation-id: 911c30cd-780f-4c46-8823-1823195c67bd
last-transition-from: review
---

# r00028 — Subpath exports en `@mcp-vertex/core`: `/contracts`, `/plugin`, `/runtime`, `/node`

## Goal

Exponer **subpath exports** en `packages/core/package.json` para que
los consumidores (plugins, packages, apps) puedan importar solo la
superficie que necesitan, sin arrastrar el barrel universal
`@mcp-vertex/core` que termina trayendo runtime, tipos Node y helpers
internos juntos.

### Comportamiento actual

- `packages/core/package.json` declara solo `"."` como entrypoint.
- Cada import desde un plugin es
  `import { definePlugin } from '@mcp-vertex/core'`, que dispara el
  barrel completo.
- Bundlers no pueden tree-shake la superficie Node cuando solo se
  importan tipos puros.
- La auditoría externa (§9) lo llama "core/public amplio": un cliente
  que solo quiere tipos termina trayendo el módulo entero.

### Comportamiento deseado

- `packages/core/package.json` declara un `exports` map:
  ```jsonc
  {
    ".": {
      "types": "./dist/public/index.d.ts",
      "default": "./dist/public/index.js"
    },
    "./contracts": {
      "types": "./dist/contracts/index.d.ts",
      "default": "./dist/contracts/index.js"
    },
    "./plugin": {
      "types": "./dist/plugin/index.d.ts",
      "default": "./dist/plugin/index.js"
    },
    "./runtime": {
      "types": "./dist/runtime/index.d.ts",
      "default": "./dist/runtime/index.js"
    },
    "./node": {
      "types": "./dist/node/index.d.ts",
      "default": "./dist/node/index.js"
    }
  }
  ```
- Cada subpath resuelve a un barrel dedicado que solo re-exporta lo
  de su concern.
- Cada subpath tiene su archivo `index.ts` bajo
  `packages/core/src/{contracts,plugin,runtime,node}/index.ts`.

## why

- Es la base sobre la que `r00030` (`@mcp-vertex/client` importar de
  `contracts`) puede dejar de depender de `@mcp-vertex/core` para
  tipos.
- Reduce bundle size del cliente: medible con `bun build` antes/
  después.
- Permite que un plugin sin necesidad de runtime (p. ej. validación
  de manifests en CI) importe solo tipos.
- Habilita que en el futuro (Track N) los barrels `node` y
  `runtime` sean lazy-loaded.

## non-goals

- No elimina el entrypoint `"."` ni rompe consumidores existentes
  (compatibilidad aditiva).
- No reorganiza archivos internos del core; solo crea nuevos
  barrels `index.ts` por concern.
- No marca APIs como `@internal` (eso es `b00238` en Track N).
- No mueve tipos puros a `@mcp-vertex/contracts` todavía (eso es
  `r00029`).

## architecture

### 1. Barrels nuevos

- `packages/core/src/contracts/index.ts` — solo tipos y constantes
  puras, sin imports de `node:*`, `fs`, `path`, `process`.
- `packages/core/src/plugin/index.ts` — `definePlugin`,
  `PluginManifest`, `PluginContext`, helpers de plugins sin
  runtime.
- `packages/core/src/runtime/index.ts` — runtime del MCP server,
  registries, routers; sin dependencias Node-only.
- `packages/core/src/node/index.ts` — helpers Node-only
  (`nodeDynamicImport`, `loadManifestFromFs`, etc.).

### 2. `package.json` `exports` map

- Respetar el orden: `"./*"` debe ir **después** de los subpaths
  nombrados; los bundlers (Bun, esbuild, webpack, rollup) resuelven
  el subpath nombrado antes que el wildcard.
- TypeScript `moduleResolution: "bundler"` o `"node16"` debe aceptar
  la estructura; verificar con `tsc --noEmit -p tsconfig.json`.

### 3. Tests

- `packages/core/tests/src/exports/subpaths.spec.ts`:
  - `import '@mcp-vertex/core/contracts'` resuelve.
  - `import '@mcp-vertex/core/plugin'` resuelve.
  - Cada subpath expone los símbolos esperados.
- Smoke test que verifica que `import 'node:fs'` desde
  `@mcp-vertex/core/contracts` falla (lint arquitectónico).
- Smoke test que el barrel `"."` sigue funcionando.

### 4. Compatibilidad

- Plugins existentes siguen importando de `@mcp-vertex/core`; el
  barrel `"."` no cambia.
- Smoke del repo entero (`bun run validate`) sigue verde.

## Slices

### S1 — `exports` map + barrels por concern

- **Status**: done
- **Files**: `packages/core/package.json`, `packages/core/src/contracts/index.ts`, `packages/core/src/plugin/index.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/node/index.ts`, `packages/core/tests/src/exports/subpaths.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00028-s1
- review-reviewer: delivery-verifier-r00028-s1
- review-log: approved by delivery-verifier-r00028-s1 — Verified independently: 5 entrypoints declared, 4 subpath barrels resolve, contracts is type-only. 8/8 tests pass.
## acceptance

- `package.json#exports` declara los 5 entrypoints.
- Cada subpath resuelve y carga sin errores en TypeScript con
  `moduleResolution: "bundler"`.
- Smoke test confirma que cada subpath importa solo sus símbolos.
- Smoke test confirma que `@mcp-vertex/core/contracts` **no** arrastra
  `node:fs`.
- Bundle size del `@mcp-vertex/client` decrece (medición
  before/after documentada en `resolution.evidence`).
- Plugins existentes siguen importando desde `"."` sin cambios.
- `bun run validate` verde.
