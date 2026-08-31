---
id: r00029
title: "Extraer `@mcp-vertex/contracts` con tipos puros sin Node"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00029"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00027 # inventario de símbolos puros
    - r00028 # subpath exports de core
    - r00030 # cliente importa de contracts
    - r00033 # envelopes compartidos (Track M)
superseded-by: d00012
---

# r00029 — Extraer `@mcp-vertex/contracts` con tipos puros sin Node

> **SUPERSEDED por [d00012](../../ready/docs/d00012-adr-contracts-subpath-vs-package.md) (ADR 0007).**
> La decisión arquitectónica —tipos puros como subpath
> `@mcp-vertex/core/contracts`, no como paquete separado— está
> registrada en el ADR 0007. El cuerpo de esta propuesta se
> conserva para trazabilidad.

## Goal

Crear un paquete **`@mcp-vertex/contracts`** en `packages/contracts/`
que contenga únicamente tipos TypeScript y constantes serializables
(JSON-friendly), **sin** ningún import de `node:*`, `fs`, `path`,
`process` ni de runtime.

Este paquete es la base sobre la que el cliente, los plugins y
cualquier consumidor externo pueden depender **sin arrastrar el
runtime del core**.

### Comportamiento actual

- Tipos puros como `PluginManifest`, `ISafeToolIdentity`,
  `EntityRef`, `OperationResult` viven mezclados con runtime en
  `packages/core/src/public/**`.
- Consumidores que solo necesitan tipos (p. ej. validación de
  manifests, generación de código, tipos compartidos con clientes
  externos) terminan importando el barrel completo de
  `@mcp-vertex/core`.
- La auditoría externa (§23, §9) lo señala como acoplamiento
  innecesario entre capas.

### Comportamiento deseado

- Nuevo paquete `packages/contracts/` con su `package.json`,
  `tsconfig.json` y `src/index.ts`.
- Solo tipos y constantes (`as const`).
- Sin dependencia de `@mcp-vertex/core`.
- Dependencias: solo `zod` y `typefest` (si las necesita para tipos
  auxiliares).
- Publicable como paquete independiente (`npm publish` dry-run
  funciona).

## why

- Es la dependencia natural del cliente (`r00030`) y de plugins
  frontend.
- Habilita que `r00033` (envelopes compartidos) viva aquí en lugar
  de duplicarse entre `core/public` y los plugins.
- Reduce drásticamente el peso de instalar el cliente sin runtime
  del servidor MCP.
- Habilita que un día se pueda publicar `@mcp-vertex/contracts` a
  npm y servir como contrato público del proyecto.

## non-goals

- No mueve runtime ni helpers con side effects a `contracts`.
- No rompe la API existente: los tipos siguen estando en
  `@mcp-vertex/core` (re-exportados), pero también en `@mcp-vertex/contracts`.
- No publica el paquete a npm en esta iteración.
- No elimina tipos de `core` (la migración es gradual).

## architecture

### 1. Estructura del paquete

```
packages/contracts/
├── package.json
│   name: "@mcp-vertex/contracts"
│   main: "./dist/index.js"
│   types: "./dist/index.d.ts"
│   dependencies: { "zod": "x.y.z" }  // solo si hace falta
├── tsconfig.json
│   target: ES2022, strict, no Node libs
├── src/
│   ├── index.ts
│   ├── plugin.ts          # PluginManifest, PluginKind, etc.
│   ├── capabilities.ts    # CapabilitySchema, CapabilityRequirement
│   ├── envelopes.ts       # EntityRef, OperationResult, PagedResult
│   ├── safety.ts          # ISafeToolIdentity, SafeScalar
│   ├── routes.ts          # RouteDescriptor, HttpMethod
│   └── primitives.ts      # Identifier, Locale, Version, etc.
└── tests/
    └── src/
        └── no-node-imports.spec.ts
```

### 2. Criterio de admisión

Un símbolo pertenece a `@mcp-vertex/contracts` sí y solo sí:

1. Es `type`, `interface` o `const` (serializable).
2. No requiere resolver nada en runtime (ni factories, ni clases con
   side effects).
3. No importa `node:*` ni nada fuera de la carpeta `src/`.
4. Su JSON Schema (o equivalent) es estable entre releases.

### 3. Migración gradual

- S1: crear el paquete con los tipos más pedidos
  (`PluginManifest`, `ISafeToolIdentity`, `EntityRef`,
  `OperationResult`).
- S2: añadir re-exports desde `@mcp-vertex/core` (compatibilidad).
- S3 (futuro, no en esta hija): mover más tipos cuando se demuestre
  estable.

### 4. Lint arquitectónico

- `tools/scripts/lint/no-node-imports-in-contracts.script.ts`:
  - Escanea `packages/contracts/src/**`.
  - Falla si encuentra `import 'node:…'`, `from 'fs'`, `from 'path'`,
    `process.env`, etc.
- Ejecutado en `bun run validate`.

### 5. Tests

- `packages/contracts/tests/src/no-node-imports.spec.ts` — el lint
  arquitectónico también es un test.
- Tests de tipos: `expectTypeOf<…>().toMatchObjectType<…>()` para
  verificar que tipos no se degradan al mover.

## Slices

### S1 — Crear `@mcp-vertex/contracts` con tipos puros iniciales

- **Status**: done
- **Files**: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, `packages/contracts/src/{plugin,capabilities,envelopes,safety,routes,primitives}.ts`, `packages/contracts/tests/src/no-node-imports.spec.ts`, `tools/scripts/lint/no-node-imports-in-contracts.script.ts`
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00029-s1
- review-reviewer: delivery-verifier-r00029-s1
- review-log: approved by delivery-verifier-r00029-s1 — Verified independently: r00029 S1 acceptance covered. (1) packages/contracts/ exists with package.json + tsconfig + 6 subpath source files (primitives, capabilities, envelopes, safety, plugin, routes) + barrel index.ts. (2) Lint passes (0 violations). (3) Build emits dist. (4) Spec passes. (5) Package has no @mcp-vertex/core dependency (forbidden by lint). (6) typecheck green.
## acceptance

- `packages/contracts/` es un paquete publicable (su `package.json`
  resuelve `npm pack --dry-run`).
- No contiene imports de `node:*`, `fs`, `path`, `process`, ni de
  `@mcp-vertex/core`.
- Lint arquitectónico pasa (incluido en `bun run validate`).
- Re-exports desde `@mcp-vertex/core` siguen funcionando para
  plugins existentes.
- Tipos exportados son los mismos (mismas firmas, mismas
  propiedades).
- `tsc --noEmit -p packages/contracts/tsconfig.json` verde.
