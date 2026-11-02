---
id: b00237
title: "Deprecar `nodeDynamicImport` exportado por `core/public`"
kind: breaking
status: done
type: proposal
track: architecture
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / b00237"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00028 # subpath exports (prerequisito: el destino debe existir)
    - b00238 # APIs internas marcadas como internal
---

# b00237 — Deprecar `nodeDynamicImport` exportado por `core/public`

## Goal

Mover `nodeDynamicImport` (helper de `packages/core/src/node/dynamic-import.ts`)
fuera de la superficie universal `@mcp-vertex/core` (entrypoint
`"."`) y exponerlo **solo** desde el subpath `@mcp-vertex/core/node`,
marcándolo como `@deprecated` en su ubicación anterior.

### Comportamiento actual

- `packages/core/src/public/index.ts` re-exporta `nodeDynamicImport`
  entre muchas otras APIs universales.
- Consumidores (cliente, plugins, scripts de tooling) lo importan
  desde `@mcp-vertex/core` pensando que es API estable.
- La auditoría externa (§9) marca esto como bug: un helper que
  requiere runtime Node (usa `import()` dinámico nativo) no debería
  estar en la superficie universal.
- Cualquier cliente que solo quiere tipos acaba arrastrando este
  helper a su bundle.

### Comportamiento deseado

- `nodeDynamicImport` ya no aparece en el barrel
  `@mcp-vertex/core`.
- Sigue accesible vía `@mcp-vertex/core/node` (subpath de
  `r00028`).
- En `packages/core/src/public/index.ts` queda un comentario
  `@deprecated` apuntando al nuevo subpath, con un re-export que
  emite warning en TypeScript (`@deprecated` JSDoc tag).
- CHANGELOG documenta la deprecation con plan de remoción en la
  próxima minor (no inmediato para no romper consumidores).

## why

- Cumple R5.1: si dos plugins necesitan garantía Node, esa garantía
  se convierte en API explícita del subpath `/node`.
- Reduce superficie universal del barrel `"."`.
- Permite que `b00238` (Track N) marque APIs internas con naming
  consistente.
- Evita que un consumidor sin Node runtime (p. ej. un plugin web)
  arrastre accidentalmente código Node.

## non-goals

- No elimina `nodeDynamicImport` todavía — se mantiene con
  `@deprecated`.
- No cambia el comportamiento del helper; solo cambia dónde vive.
- No rompe a consumidores existentes en esta iteración (solo
  warning).
- No cambia la API del subpath `/node`.
- No refactoriza la decisión arquitectónica "contracts como
  paquete vs subpath". Esa decisión es estable: ver
  [`d00012`](../../ready/docs/d00012-adr-contracts-subpath-vs-package.md).

## architecture

### 1. Movimiento

- `packages/core/src/node/dynamic-import.ts` — ubicación canónica.
- `packages/core/src/node/index.ts` (nuevo en `r00028`) — barrel del
  subpath, re-exporta `nodeDynamicImport`.
- `packages/core/src/public/index.ts` — eliminar la línea de
  re-export. Si se quiere conservar un shim de deprecation:
  ```ts
  /**
   * @deprecated since 1.4.0 — use `@mcp-vertex/core/node` instead.
   * Will be removed in 1.5.0.
   */
  export { nodeDynamicImport } from '../node/dynamic-import.js';
  ```

### 2. Advertencia en TypeScript

- El `@deprecated` JSDoc tag hace que `tsc --noEmit` emita warning
  (no error) en cualquier consumidor que importe desde `"."`.
- Lint arquitectónico `no-deprecated-re-exports-from-public` para
  CI: falla si en `packages/core/src/public/index.ts` hay
  `@deprecated` (es decir, garantiza que solo el subpath expone la
  API real).

### 3. CHANGELOG

- Entrada en `CHANGELOG.md` bajo la próxima minor:
  > `Deprecated`: `nodeDynamicImport` ya no se exporta desde
  > `@mcp-vertex/core`. Usa `@mcp-vertex/core/node` en su lugar.
  > El re-export desde el barrel universal se eliminará en la
  > siguiente minor.

### 4. Tests

- Smoke test: `import 'nodeDynamicImport' from '@mcp-vertex/core'`
  emite warning de TS pero sigue funcionando.
- Smoke test: `import 'nodeDynamicImport' from '@mcp-vertex/core/node'`
  no emite warning.
- Lint pasa.

## Slices

### S1 — Mover a subpath + `@deprecated` shim + CHANGELOG

- **Status**: done
- **Files**: `packages/core/src/public/index.ts`, `packages/core/src/node/index.ts`, `packages/core/src/node/dynamic-import.ts`, `packages/core/tests/src/public/deprecation.spec.ts`, `CHANGELOG.md`, `tools/scripts/lint/no-deprecated-re-exports-from-public.script.ts`
- **Gate**: type
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: requested_changes by owl — La implementación es coherente, pero la prueba sólo inspecciona JSDoc textual y no demuestra el diagnóstico de deprecación en el consumo desde la raíz ni la ausencia de diagnóstico en el subpath canónico. Añadir una comprobación de contrato viable con las herramientas del repositorio, sin ampliar el alcance.
- review-log: approved by delivery_verifier
## acceptance

- `nodeDynamicImport` no aparece en el barrel `"."` de
  `@mcp-vertex/core` (o aparece con `@deprecated` JSDoc).
- Sigue accesible vía `@mcp-vertex/core/node`.
- Warning de TypeScript visible al importar desde `"."`.
- Lint arquitectónico pasa.
- Smoke test de TS confirma ambos paths.
- CHANGELOG documentado.
- `bun run validate` verde.
