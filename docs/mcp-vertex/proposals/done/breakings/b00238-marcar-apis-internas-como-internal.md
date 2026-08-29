---
id: b00238
title: "Marcar APIs internas como `internal`"
kind: breaking
status: done
type: proposal
track: architecture
date: 2026-08-25
priority: P2
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track N / b00238"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00027 # inventario (lista las APIs a marcar)
    - b00237 # deprecar nodeDynamicImport (predecesor de patrón)
---

# b00238 — Marcar APIs internas como `internal`

## Goal

Introducir la convención **`*Internal` / `/_internal`** para APIs
internas del core: cualquier símbolo que no deba ser consumido por
plugins o usuarios externos se renombra o se mueve al barrel
`/_internal`. El inventario `r00027` marca cuáles son.

### Comportamiento actual

- APIs internas (p. ej. helpers de router, builders de manifests,
  internals de plugin loading) están mezcladas en `core/public` con
  APIs estables.
- Un plugin deshonesto o un cliente externo que importe esos
  internals obtiene funcionalidad que el core no garantiza.
- La auditoría externa (§50) lo marca como falta de boundary
  arquitectónico.

### Comportamiento deseado

- Convención:
  - Renombrar `xxx` a `xxxInternal` cuando es un helper privado.
  - O mover a `packages/core/src/internal/**` y exponer solo vía
    `@mcp-vertex/core/_internal`.
- El inventario `r00027` clasifica cada símbolo; los marcados como
  `internal` se mueven a la nueva ubicación.
- Lint arquitectónico:
  - `tools/scripts/lint/no-internal-imports.script.ts` falla si
    encuentra un import de un símbolo `*Internal` o desde
    `@mcp-vertex/core/_internal` fuera de `packages/core/**`.
- CHANGELOG documenta la deprecation (no rotura inmediata).

## why

- Cierra §50 de la auditoría.
- Cumple R5.1: las APIs internas no deben filtrarse a la superficie
  pública.
- Da claridad sobre qué puede usar un plugin y qué no.
- Reduce superficie universal del barrel `"."`.

## non-goals

- No rompe a consumidores existentes en esta iteración; los
  internals se mueven y los nombres antiguos se marcan
  `@deprecated`.
- No reorganiza toda la base: solo las APIs marcadas como
  `internal` en el inventario `r00027`.
- No introduce un mecanismo de control de acceso (eso es Track F).

## architecture

### 1. Convención

- Naming: `xxxInternal` para funciones/tipos, `/_internal` para
  barrels.
- JSDoc: cada `*Internal` lleva:
  ```ts
  /**
   * @internal
   * Not part of the public API. Subject to change without notice.
   */
  ```

### 2. Lint

- `tools/scripts/lint/no-internal-imports.script.ts`:
  - Detecta imports de `*Internal` fuera de `packages/core/**`.
  - Detecta imports de `@mcp-vertex/core/_internal` fuera de
    `packages/core/**`.
- Whitelist explícita para casos legítimos.

### 3. Migración

- Por cada símbolo `internal` del inventario `r00027`:
  1. Renombrar a `xxxInternal` o mover a `/_internal`.
  2. Añadir re-export desde el sitio antiguo con `@deprecated`.
  3. Actualizar importers internos (los `packages/core/**` sí
     pueden usar los internals).

### 4. Tests

- `tools/scripts/lint/no-internal-imports.spec.ts`:
  - Import legítimo en `packages/core/**` → exit 0.
  - Import ilegítimo en `plugins/**` → exit 1.

## Slices

### S1 — Convención + lint + migración inicial

- **Status**: done
- **Files**: `tools/scripts/lint/no-internal-imports.script.ts`, `tools/scripts/lint/no-internal-imports.spec.ts`, migraciones específicas (dependen del inventario `r00027`)
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: el cambio se limita a permitir imports internos cuando la ruta pertenece a packages/core, mantiene el bloqueo fuera de core y añade cobertura focalizada para scanText y detectInternalImports. Validación ejecutada: bun test tools/scripts/lint/no-internal-imports.spec.ts => 12/12; bun run lint:internal-naming => 0 violaciones. El typecheck amplio de tools/tsconfig.json queda excluido por el bloqueo documentado de errores preexistentes fuera del slice; el intento sin tsconfig no es representativo por tipos Bun/Node ausentes.
## acceptance

- Convención `*Internal` / `/_internal` documentada.
- Lint bloquea imports ilegítimos.
- Migración inicial de al menos 3 APIs internas marcadas en el
  inventario.
- CHANGELOG documenta la convención.
- `bun run validate` verde.
