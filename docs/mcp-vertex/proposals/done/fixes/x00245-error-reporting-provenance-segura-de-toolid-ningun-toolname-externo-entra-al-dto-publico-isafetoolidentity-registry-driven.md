---
id: x00245
title: "error-reporting — provenance segura de toolId: ningún toolName externo entra al DTO público (ISafeToolIdentity registry-driven)"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§4 ER2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00214 # DTO seguro (predecesor)
    - x00236 # internalOnly:false (hermano)
    - x00237 # runtime version source (hermano)
    - t00009 # privacy adversarial regression
    - f00158 # error-reporting + issues-triage base
shipped-in:
  - 0d546d5e # fix(error-reporting): derive safe tool identity from registry
---

# x00245 — error-reporting: provenance segura de toolId

## Goal

`plugins/error-reporting/src/lib/report-builder.helper.ts` construye el report público con `toolId: toolName`. Aunque el error sea legítimamente interno a Vertex, `toolName` puede pertenecer a una tool registrada por el host/proyecto. Ejemplo conceptual: una tool llamada `superbank_internal_fraud_reconciliation` o `acme_hr_onboarding` provoca un fallo interno Vertex y, al pasar por el pipeline actual, su nombre puede llegar al DTO público.

Esto es un riesgo legal y de privacidad **P0**. La auditoría §3 marca los tool names externos como Class C (project data): nunca deben salir del boundary del proyecto.

**Reglas violadas actualmente**: R1.1 (privacidad por construcción), R1.5 (dos proyectos con el mismo bug → mismo issue), §3.2 de la auditoría, ER2-001.


```ts
// plugins/error-reporting/src/lib/report-builder.helper.ts (extracto relevante)
export function buildSafeReport(input: {
  error: Error;
  toolName: string;       // ← string arbitrario del caller
  args: unknown;
  // ...
}): ISafeMcpVertexReport {
  return {
    toolId: input.toolName,  // ← FUGA: el nombre llega al DTO transmisible
    // ...
  };
}
```

Reproducción (test que falla en el HEAD actual):

1. Registrar una tool externa `privatecompany_reconciliation_execute` en un host.
2. Provocar un error interno Vertex (`throw new McpVertexInternalError('VM-INTERNAL-001')`).
3. Capturar el `ISafeMcpVertexReport` antes de la fase de submit.
4. `report.toolId === 'privatecompany_reconciliation_execute'` → **FUGA**.


`CONFIRMADO` (ER2-001) — el patrón está visible en el código y se reproduce trivialmente.

## Why

Ninguno observable para el usuario en operación normal. El impacto es de **riesgo legal**: publicación de identificadores del proyecto del consumidor en issues públicos de Vertex sin consentimiento. Esto puede violar:

- RGPD (si el tool name codifica propósito del negocio → inferencia de actividad).
- Acuerdos de confidencialidad comerciales (tool names que revelan dominios de negocio: banca, salud, legal, reconciliación, onboarding).
- Propiedad intelectual (algunos nombres sugieren arquitectura interna).

**Severidad legal: ALTA.** Sin acción correctiva, cada issue generada por un consumidor puede exponer metadatos comercialmente sensibles.


- **Class A** (MCP Vertex internal): permitido, p. ej. `safeToolId: '@mcp-vertex/proposals.create_proposal'`.
- **Class C** (project data): **PROHIBIDO** — cualquier tool name del host/proyecto.
- **Class B** (coarse environment): permitido solo si la información útil es ambigua (p. ej. `pluginOwner: 'external'`).

Reglas de privacy impact para esta propuesta:

| Tipo de tool                        | `toolId` permitido en DTO          |
|-------------------------------------|------------------------------------|
| `@mcp-vertex/*`                     | Sí, completo y verificado          |
| Host custom (no-Vertex, no-prefix)  | NO; se omite o se categoriza       |
| Tool externa con prefijo engañoso   | NO; verificación por registry, no por string match |
| Tool cuyo nombre parece Vertex pero no está registrada | NO; **no confiar en prefijo** |


Cero. Esta propuesta **reduce** el coste del reporter (no incluye toolId externo cuando es privado). No añade tools.

## Non-goals

**Permitido**:

- `plugins/error-reporting/src/**` (servicios, contratos, helpers, tests).
- `packages/core/src/lib/contracts/**` (registro de tool provenance si se centraliza).
- Documentación: `docs/mcp-vertex/plugins/error-reporting.md`.
- Catálogo: regenerar `FIRST_PARTY_PLUGIN_INDEX` si la metadata cambia.

**No permitido**:

- Cualquier cambio en plugins terceros (host/proyecto) que ya registran tools.
- `plugins/issues-triage/**` (es interno y recibe el DTO ya seguro; no toca provenance).


- Política de qué tools Vertex decide reportar internamente (`internalOnly` se trata en `x00236`).
- Cambio de la versión del runtime (`x00237`).
- Privacy adversarial suite completa (`t00009`).
- Synthetic examples generator (ya existe como parte de `x00214`).

## Architecture

### 1. Tipo canónico de provenance

```ts
// packages/core/src/lib/contracts/interfaces/safe-tool-identity.interface.ts
export type ToolOwner =
  | 'mcp-vertex'           // registrado por un paquete @mcp-vertex/*
  | 'first-party-host'     // registrado por el host (no es Vertex, pero vive en el repo)
  | 'external-mcp'         // MCP bridge externo (p. ej. web-fetch, browser-mcp)
  | 'host-project';        // registrado por el proyecto del usuario (lo más sensible)

export interface ISafeToolIdentity {
  /** Clasificación pública estable (NO incluye el nombre real). */
  owner: ToolOwner;

  /**
   * Identificador público SEGURO, presente solo si owner === 'mcp-vertex'.
   * Forma: "@mcp-vertex/<plugin-id>.<tool-id>".
   * NUNCA se rellena con strings arbitrarios del caller.
   */
  safeToolId?: string;

  /** Categoría pública (estable, sin datos del usuario). */
  category:
    | 'orchestration'
    | 'analysis'
    | 'file'
    | 'network'
    | 'process'
    | 'reporting'
    | 'external-bridge'
    | 'host-specific'
    | 'unknown';
}
```

### 2. Resolución desde registry metadata

```ts
// packages/core/src/lib/contracts/resolvers/safe-tool-identity.resolver.ts
export interface IToolRegistryEntry {
  /** package npm real, p. ej. "@mcp-vertex/proposals". */
  packageName: string;
  /** scope derivado del packageName. */
  owner: ToolOwner;
  /** Categoría opcional ya declarada por el plugin. */
  category?: ISafeToolIdentity['category'];
}

export function resolvePublicToolIdentity(
  toolName: string,
  registry: ReadonlyMap<string, IToolRegistryEntry>,
): ISafeToolIdentity {
  const entry = registry.get(toolName);

  // No entry → desconocido → nunca propagar el nombre al DTO público.
  if (!entry) {
    return { owner: 'host-project', category: 'unknown' };
  }

  // Verificación por packageName real, NO por prefijo de string.
  // Si un atacante nombra su tool "mcp_vertex_internal_*", debe quedar como host-project.
  const isVertex = entry.packageName.startsWith('@mcp-vertex/');

  return isVertex
    ? {
        owner: 'mcp-vertex',
        safeToolId: `${entry.packageName}.${toolName}`,
        category: entry.category ?? 'unknown',
      }
    : {
        owner: entry.owner,
        category: entry.category ?? 'unknown',
      };
}
```

### 3. Integración en el pipeline del reporter

El `error-reporting` plugin:

- Pasa de aceptar `toolName: string` a aceptar `toolName: string` + `registry: ReadonlyMap<string, IToolRegistryEntry>` (inyectado por el host durante bootstrap).
- Antes de construir el DTO, llama `resolvePublicToolIdentity(toolName, registry)`.
- Si el resultado tiene `safeToolId`, lo incluye; en otro caso, **omite** el campo `toolId` del DTO público (o lo sustituye por `category: 'host-specific'`, decisión del spec).

```ts
// plugins/error-reporting/src/lib/report-builder.helper.ts
export function buildSafeReport(input: {
  error: McpVertexInternalError;
  toolName: string;
  toolRegistry: ReadonlyMap<string, IToolRegistryEntry>; // ← nuevo, inyectado
  // args eliminados: ya estaban prohibidos por x00214
}): ISafeMcpVertexReport {
  const identity = resolvePublicToolIdentity(input.toolName, input.toolRegistry);

  return {
    mcpVertexVersion: input.error.mcpVertexVersion,
    packageId: input.error.packageId,
    componentId: input.error.componentId,
    errorCode: input.error.code,
    failureClass: input.error.failureClass,
    safeToolId: identity.safeToolId,   // undefined si no es Vertex
    toolOwner: identity.owner,         // público, sin nombre del tool
    toolCategory: identity.category,   // público
    safeFrames: extractSafeFrames(input.error),
    syntheticExample: input.error.syntheticExample,
    environment: {
      runtime: input.error.runtime,    // 'node' | 'bun' | 'unknown'
      os: input.error.os,              // 'linux' | 'darwin' | 'windows' | 'unknown'
    },
    timestamp: input.error.timestamp,
    fingerprint: computeFingerprint(input.error),
  };
}
```

### 4. Tests obligatorios (NO negociables)

| Test                                                                     | Esperado                                          |
|--------------------------------------------------------------------------|---------------------------------------------------|
| Tool `@mcp-vertex/proposals.create_proposal`                             | `safeToolId` presente, `owner: 'mcp-vertex'`      |
| Tool host custom `privatecompany_reconciliation_execute`                 | `safeToolId` ausente, `owner: 'host-project'`     |
| Tool externa con prefijo falso `mcp_vertex_internal_fraud`               | `safeToolId` ausente, `owner: 'host-project'`     |
| Tool externa MCP bridge (p. ej. `web_fetch.fetch_url`)                   | `safeToolId` ausente, `owner: 'external-mcp'`     |
| Tool sin entry en el registry (caso límite)                              | `safeToolId` ausente, `owner: 'host-project'`     |
| Dos hosts distintos ejecutan el mismo error Vertex                       | Ambos reports tienen **mismo** `safeToolId` o **ninguno** |
| `safeToolId` nunca contiene `privatecompany`, `acme_`, `superbank_`, etc. | Aserción regex en DTO serializado                  |

### 5. Adversarial regression

`t00009` ejecuta la suite anterior dentro de la privacy adversarial regression.

## Slices

- global_gate: type

### S1 — Tipo `ISafeToolIdentity` + resolver

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/safe-tool-identity.interface.ts`, `packages/core/src/lib/contracts/resolvers/safe-tool-identity.resolver.ts`
- **Gate**: type
- acceptance:
  - "Tipo `ISafeToolIdentity` exportado y testeado."
  - "Resolver `resolvePublicToolIdentity(toolName, registry)` con semántica documentada."
  - "Tipos branded `Brand<'SafeToolId', '@mcp-vertex/*'>` para reforzar contrato."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: lint:diagram-usage/limit verificado; validate verde.
### S2 — Integración en `error-reporting` + DTO actualizado

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/report-builder.helper.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/reporter.interface.ts`
- **Gate**: type
- acceptance:
  - "El reporter ya no acepta `toolName` sin `toolRegistry`; tipo lo exige."
  - "Campo `toolId` renombrado a `safeToolId`; nuevo `toolOwner` + `toolCategory` públicos."
  - "Cuando `toolOwner !== 'mcp-vertex'`, `safeToolId` queda `undefined`."

### S3 — Lint arquitectónico `privacy-tool-id`

- **Status**: done
- **Files**: `tools/scripts/lint/privacy-tool-id.script.ts`
- **Gate**: type
- acceptance:
  - "El lint detecta asignaciones directas de `toolId: toolName` y falla el build."
  - "Está añadido al runner de `bun run validate`."

### S4 — Tests adversariales + snapshot

- **Status**: done
- **Files**: `packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.resolver.spec.ts`, `packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.property.spec.ts`, `plugins/error-reporting/tests/report-builder.spec.ts`, `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: type
- acceptance:
  - "≥10 tests unitarios pasan, incluyendo prefijo engañoso, unicode, longitud máxima."
  - "Property tests verdes (fast-check)."
  - "Snapshot del DTO serializado no contiene nombres host-project en ningún caso de prueba."

## Acceptance

- **Unit**: `plugins/error-reporting/tests/report-builder.spec.ts` (existente, ampliar).
- **Unit**: `packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.resolver.spec.ts` (nuevo).
- **Property**: `packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.property.spec.ts` (nuevo) — fast-check sobre nombres adversariales (prefijo engañoso, unicode, espacios, longitud máxima).
- **Integration**: dos hosts ficticios registran sus tools; mismo error Vertex → mismo report (o ambos sin `safeToolId`).
- **Snapshot** del DTO serializado (con y sin tool) — la regex sobre la serialización debe pasar.


- [ ] El reporter no acepta `toolName` sin `toolRegistry`; el tipo lo exige.
- [ ] `resolvePublicToolIdentity` está cubierto con ≥10 tests unitarios (incluyendo prefijos engañosos).
- [ ] Ningún test adversario logra que un nombre `host-project` llegue a `safeToolId`.
- [ ] La regex adversarial `/(privatecompany|acme|superbank|...)/i` sobre el JSON serializado no encuentra coincidencias en casos host-project.
- [ ] Dos hosts con tools distintas que provocan el mismo error interno producen reports idénticos (mismo `safeToolId` ausente o mismo `safeToolId` Vertex).
- [ ] Documentación actualizada en `docs/mcp-vertex/plugins/error-reporting.md`: sección "Tool provenance" explica que el reporter nunca incluye tool names externos.
- [ ] `bun run lint:privacy` (nuevo o existente) verde.
- [ ] `bun run validate` verde.


- El reporter no acepta `toolName` sin `toolRegistry`; el tipo lo exige.
- `resolvePublicToolIdentity` está cubierto con ≥10 tests unitarios (incluyendo prefijos engañosos).
- Ningún test adversario logra que un nombre `host-project` llegue a `safeToolId`.
- La regex adversarial sobre el JSON serializado no encuentra coincidencias en casos host-project.
- Dos hosts con tools distintas que provocan el mismo error interno producen reports idénticos.
- Documentación actualizada en `docs/mcp-vertex/plugins/error-reporting.md`.
- `bun run lint:privacy` verde.
- `bun run validate` verde.

---

## Notes

- **Lint arquitectónico**: nuevo `tools/scripts/lint/privacy-tool-id.script.ts` que:
  - Lee `plugins/error-reporting/src/lib/report-builder.helper.ts`.
  - Falla si ve `toolId: input.toolName` o cualquier asignación directa sin pasar por `resolvePublicToolIdentity`.
- **Type-level guard**: `ISafeMcpVertexReport.toolId` se renombra a `safeToolId` y se marca como `?: never` cuando `toolOwner !== 'mcp-vertex'`. Tipo branded `Brand<'SafeToolId', '@mcp-vertex/*'>` para reforzar el contrato.
- **Property test**: corre en CI; cualquier herramienta registrada que no sea Vertex y se cuele en `safeToolId` rompe el build.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - tests:
        - plugins/error-reporting/tests/report-builder.spec.ts
        - packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.resolver.spec.ts
        - packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.property.spec.ts
        - t00009-privacy-adversarial-regression
    - lint: tools/scripts/lint/privacy-tool-id.script.ts
    - privacy-adversarial-suite: green
    - before/after:
        before: "toolId: toolName — fuga confirmada en test"
        after:  "safeToolId: undefined|@mcp-vertex/* — fuga cerrada"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track D (Privacidad P0).
- **Auditoría legada**: `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md`, §3 (invariante de privacidad) + §4 (ER2-001).
- **Hermanas**: `x00236` (retirar `internalOnly:false`), `x00237` (runtime version source), `t00009` (privacy adversarial regression suite).
- **Predecesora**: `x00214` (DTO seguro base — esta propuesta opera sobre la base ya endurecida).
