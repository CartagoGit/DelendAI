---
id: f00194
title: "Capability versioning (`requires: { capability: '^2' }`)"
kind: feat
status: done
type: proposal
track: external-mcps
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - f8cf1260
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track K / f00194"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00188 # capability schema (definición de capability)
    - f00193 # external MCPs (registra capabilities versionadas)
    - d00009 # capability matrix
---

# f00194 — Capability versioning (`requires: { capability: '^2' }`)

## Goal

Introducir **versionado semver por capability** en el manifest de
un plugin: un plugin declara `requires: { 'git:write': '^2.0.0' }`
y el host, al activar, resuelve qué versión de la capability está
disponible y decide si es compatible.

### Comportamiento actual

- Las capabilities (`f00188`) son strings opacos sin versión.
- Cuando un plugin necesita una capability `v2` y el host solo
  expone `v1`, no hay forma declarativa de detectarlo.
- La auditoría externa (§38) lo marca como gap: el grafo no
  razona sobre compatibilidad.

### Comportamiento deseado

- Schema de capability versionado:
  ```ts
  type VersionedCapability = {
    capability: string;     // 'git:write'
    version: string;        // '2.1.0'
    /** Soporta semver ranges del plugin que requiere */
  };
  type CapabilityRequirement = {
    [capability: string]: string;  // '^2.0.0', '~1.4.0', '>=2'
  };
  ```
- En el manifest del plugin:
  ```ts
  definePlugin({
    name: 'commit-policy',
    requires: { 'git:write': '^2.0.0' },
    capabilities: ['git:write'],
  });
  ```
- Resolución:
  - `packages/core/src/lib/capabilities/versioning.ts` carga el
    semver disponible y compara con el requirement.
  - Si el requirement no se cumple, `activate()` falla con refusal
    tipado `{ kind: 'capability-version-mismatch', capability,
    required, available }`.
- Para providers externos (`f00193`): cada provider declara la
  versión de cada capability que expone.

## why

- Cierra §38 de la auditoría.
- Habilita compatibilidad cross-version entre providers externos.
- Habilita upgrades seguros: el plugin declara lo que necesita; el
  host decide si puede cumplir.
- Habilita el patrón "soft deprecation": un capability `v2` puede
  declarar que reemplaza a `v1` con un mapeo de compat.

## non-goals

- No implementa resolución de versiones a nivel npm (es solo para
  capabilities).
- No cambia el modelo actual de capabilities no versionadas (se
  trata como `version: "0.0.0"` y cualquier range las acepta).
- No introduce un resolver semántico estilo Cargo; usa `semver`
  puro.

## architecture

### 1. Schema

- `packages/core/src/lib/capabilities/versioning.ts`:
  - Tipo `CapabilityRequirement`.
  - Función `resolve(requirement, provided): Result<Version,
    Refusal>`.

### 2. Integración

- `packages/core/src/lib/capabilities/inject.ts` (`f00188`):
  - Antes de inyectar capabilities, valida el requirement.
- `packages/client/src/services/external-mcp/registry.ts`
  (`f00193`):
  - Cada provider declara versiones por capability.

### 3. Refusal tipado

- `capability-version-mismatch`:
  - `capability`: id.
  - `required`: range.
  - `available`: versiones conocidas.

### 4. Tests

- `packages/core/tests/src/lib/capabilities/versioning.spec.ts`:
  - Range `^2` acepta `2.0.0`, `2.3.4`, rechaza `1.x`, `3.0.0`.
  - Range `~1.4` acepta `1.4.x`, rechaza `1.5.0`.
  - Mismatch devuelve refusal con datos completos.

## Slices

### S1 — Schema versioning + resolución + tests

- **Status**: done
- **Files**: `packages/core/src/lib/capabilities/versioning.ts`, `packages/core/src/lib/capabilities/inject.ts`, `packages/core/tests/src/lib/capabilities/versioning.spec.ts`, manifest schemas (extensión)
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: la suite de capability versioning pasa 25/25 y el typecheck de packages/core pasa. La implementación coincide con el alcance funcional del slice y no requiere crear los archivos declarados como manifest extension para este gate.
## acceptance

- Schema acepta `requires: { capability: '^x.y.z' }`.
- Resolución semver funciona con `^`, `~`, `>=`, `=`.
- Refusal tipado en mismatch.
- Tests verdes.
- Sin romper plugins sin `requires` declarado.
