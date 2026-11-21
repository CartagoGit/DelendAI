---
id: x00237
title: "error-reporting — fuente canónica de mcpVertexVersion: build-time injected desde @mcp-vertex/core (no del root package.json)"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-25
priority: P0
classification: MEJORA / CORRECTITUD DIAGNÓSTICA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§4 ER2-003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00214 # DTO seguro (predecesor)
    - x00245 # safe tool identity (hermano)
    - x00236 # internalOnly:false (hermano)
    - t00009 # privacy adversarial regression
shipped-in:
  - cc866ce4 # fix(privacy): x00237 — source mcpVertexVersion from core
---

# x00237 — error-reporting: fuente canónica de `mcpVertexVersion`

## Goal

`mcpVertexVersion` se deriva del `package.json` raíz privado del monorepo. Ese valor (`version: 0.1.0` por defecto del root privado) **no necesariamente coincide** con la versión pública real de `@mcp-vertex/core`.

Consecuencias:

- Issues generadas dicen `mcpVertexVersion: 0.1.0` cuando el usuario está corriendo `@mcp-vertex/core@1.4.2`.
- Diagnóstico equivocado: equipo de Vertex busca bugs en código que ya no existe.
- Métricas de adopción/distribución distorsionadas.
- En casos extremos, se confunde una versión beta con una estable y se filtra info interna del ciclo de release.

No es seguridad; es **correctitud diagnóstica** y operabilidad.

Reglas relacionadas: §3 auditoría (la versión de Vertex SÍ es Class A — permitida — pero debe ser la real).


```ts
// plugins/error-reporting/src/lib/report-builder.helper.ts (extracto)
import rootPackageJson from '../../../../package.json' with { type: 'json' };
//                                       ↑ package.json del monorepo raíz, no el del paquete publicado

export const MCP_VERTEX_VERSION = rootPackageJson.version;  // ej. '0.1.0'
```

```json
// package.json (root, privado)
{
  "name": "mcp-vertex-monorepo",
  "version": "0.1.0",   // ← versión interna del monorepo, no la publicada
  ...
}
```

```json
// packages/core/package.json (publicado)
{
  "name": "@mcp-vertex/core",
  "version": "1.4.2",   // ← esta es la versión que el usuario corre
  ...
}
```

Reproducción (test que falla en el HEAD actual):

```ts
test('mcpVertexVersion matches @mcp-vertex/core', () => {
  const reportedVersion = reportBuilder.MCP_VERTEX_VERSION;
  const corePackageVersion = readCorePackageJson().version;
  expect(reportedVersion).toBe(corePackageVersion); // ← falla si root != core
});
```


`MEJORA / CORRECTITUD DIAGNÓSTICA` — bug confirmado pero severidad moderada (P0 en este plan por consistencia del Track D).

## Why

- Operadores de Vertex: ven la versión correcta en cada issue.
- Equipo de soporte: puede mapear issues a releases reales.
- No hay impacto en privacidad: `mcpVertexVersion` ya era Class A (permitida).


Neutro. La versión de Vertex es Class A — siempre permitida. El cambio mejora la fidelidad de la metadata pública sin ampliar superficie.


Cero. No afecta el reporter payload.

## Non-goals

**Permitido**:

- `packages/core/src/lib/version.ts` (nuevo): exporta `MCP_VERTEX_VERSION` desde su propio `package.json`.
- `packages/core/src/public.ts` (si existe): exportar la constante.
- `plugins/error-reporting/src/lib/report-builder.helper.ts`: importar desde `@mcp-vertex/core` en lugar del root.
- Build/release scripts: inyectar build-time como respaldo si el import directo no funciona en todos los runtimes.
- `plugins/error-reporting/tests/**`: añadir test que verifica que la versión reportada coincide con `packages/core/package.json#version`.

**No permitido**:

- Cambiar el formato del campo `mcpVertexVersion` en el DTO.
- Cambiar la política de qué versiones se reportan.
- Cualquier cosa que añada versiones distintas a la del paquete publicado (build hash, commit SHA, etc.) — eso pertenece a otra propuesta si se quiere.


- Renombrar el campo en el DTO.
- Añadir release channel / nightly detection.
- Cambiar la frecuencia de release o versionado.

## Architecture

### 1. Fuente única: `@mcp-vertex/core/package.json`

```ts
// packages/core/src/lib/version.ts
import corePackageJson from '../../package.json' with { type: 'json' };

/**
 * Versión EFECTIVA del runtime publicado.
 * Esta es la versión que aparece en issues públicas de error-reporting.
 *
 * Garantía: este valor coincide con `packages/core/package.json#version`
 * en el commit publicado. Validado por test en `version.spec.ts`.
 */
export const MCP_VERTEX_VERSION: string = corePackageJson.version;
```

### 2. Import desde el plugin

```ts
// plugins/error-reporting/src/lib/report-builder.helper.ts
import { MCP_VERTEX_VERSION } from '@mcp-vertex/core/version';

// ... resto del report
return {
  mcpVertexVersion: MCP_VERTEX_VERSION,
  // ...
};
```

### 3. Respaldo build-time (opcional, si el import no funciona en algún bundler)

Si el build de un consumidor no soporta `import ... with { type: 'json' }`,提供一个 fallback build-time:

```ts
// packages/core/build/inject-version.script.ts (nuevo, llamado en CI/build)
// Inyecta la versión como string literal en dist/version.js
```

El script:

1. Lee `packages/core/package.json#version`.
2. Genera `packages/core/src/lib/version.generated.ts` con `export const MCP_VERTEX_VERSION = '<x.y.z>';`.
3. Se ejecuta en CI antes del build de producción.

Esta propuesta prefiere el **import directo** como camino primario; el fallback solo se activa si el bundler del consumidor no soporta `import attributes`.

### 4. Test que garantiza fidelidad

```ts
// packages/core/tests/src/lib/version.spec.ts
import { MCP_VERTEX_VERSION } from '../../src/lib/version';
import corePackageJson from '../../package.json' with { type: 'json' };

describe('MCP_VERTEX_VERSION', () => {
  it('matches the published @mcp-vertex/core package.json#version', () => {
    expect(MCP_VERTEX_VERSION).toBe(corePackageJson.version);
  });

  it('is a valid semver string', () => {
    expect(MCP_VERTEX_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('is not the monorepo root version', () => {
    const rootVersion = readMonorepoRootVersion();
    // En CI de release, ambos coinciden; en dev, este test se salta con tag.
    if (process.env.CI_RELEASE) {
      expect(MCP_VERTEX_VERSION).toBe(rootVersion);
    } else {
      // En dev, solo exigimos que venga de core, no del root.
      expect(MCP_VERTEX_VERSION).toBe(corePackageJson.version);
    }
  });
});
```

### 5. Verificación cruzada en `error-reporting`

```ts
// plugins/error-reporting/tests/src/lib/report-builder.spec.ts
describe('report uses correct mcpVertexVersion', () => {
  it('report.mcpVertexVersion === @mcp-vertex/core version', async () => {
    const { MCP_VERTEX_VERSION } = await import('@mcp-vertex/core/version');
    const corePkg = await import('@mcp-vertex/core/package.json');

    const report = buildSafeReport({
      error: new McpVertexInternalError('TEST-001'),
      toolName: '@mcp-vertex/proposals.create_proposal',
      toolRegistry: new Map(),
    });

    expect(report.mcpVertexVersion).toBe(MCP_VERTEX_VERSION);
    expect(report.mcpVertexVersion).toBe(corePkg.version);
  });
});
```

## Slices

- global_gate: type

### S1 — Constante en `packages/core`

- **Status**: done
- **Files**: `packages/core/src/lib/version.ts`
- **Gate**: type
- acceptance:
  - "`MCP_VERTEX_VERSION` exportado desde el `package.json` del paquete core."
  - "Test `version.spec.ts` verde."

### S2 — Integración en `error-reporting`

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/report-builder.helper.ts`
- **Gate**: type
- acceptance:
  - "El reporter importa `MCP_VERTEX_VERSION` desde `@mcp-vertex/core/version`."
  - "Ya no importa del root `package.json`."
  - "Test `report-builder.spec.ts` verde con cross-check."

### S3 — Fallback build-time (si aplica) + docs

- **Status**: done
- **Files**: `packages/core/build/inject-version.script.ts` (opcional), `docs/mcp-vertex/plugins/error-reporting.md`
- **Gate**: type
- acceptance:
  - "Si el bundler del consumidor no soporta `import attributes`, el fallback genera `version.generated.ts`."
  - "Documentación actualizada mencionando el origen de la versión."

## Acceptance

- **Unit**: `packages/core/tests/src/lib/version.spec.ts` (nuevo).
- **Unit**: `plugins/error-reporting/tests/src/lib/report-builder.spec.ts` (extender con `mcpVertexVersion` check).
- **Cross-package**: import real desde `@mcp-vertex/core` resuelve y la versión coincide con `package.json`.
- **Snapshot**: el report serializado contiene `mcpVertexVersion` que pasa la regex semver.


- [ ] `packages/core/src/lib/version.ts` exporta `MCP_VERTEX_VERSION` desde su propio `package.json`.
- [ ] `plugins/error-reporting/src/lib/report-builder.helper.ts` ya no importa del root `package.json`.
- [ ] `mcpVertexVersion` en cualquier issue generada coincide con `@mcp-vertex/core@X.Y.Z` que el usuario está corriendo.
- [ ] Tests verdes (`version.spec.ts`, `report-builder.spec.ts`).
- [ ] Si se usa el fallback build-time, el script está integrado en `bun run build`.
- [ ] Documentación (`docs/mcp-vertex/plugins/error-reporting.md`) menciona explícitamente que `mcpVertexVersion` proviene del paquete publicado, no del root.
- [ ] `bun run validate` verde.


- `MCP_VERTEX_VERSION` exportado desde el paquete `@mcp-vertex/core`.
- El reporter importa desde `@mcp-vertex/core`, no desde el root.
- Tests verdes.
- Documentación actualizada.

---

## Notes

- **Test en CI**: `version.spec.ts` corre en cada build; falla si `MCP_VERTEX_VERSION !== corePackageJson.version`.
- **Doc grep test**: `grep -nR "from.*'\.\./\.\./\.\./package\.json'" plugins/error-reporting/src` no debe encontrar matches que importen `version` (otros campos del package.json pueden seguir importándose si se justifica).
- **Snapshot** del report: si cambia la versión, el snapshot se actualiza **explícitamente** con un commit que explique el bump.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - before/after:
        before: "MCP_VERTEX_VERSION = monorepo root package.json#version (0.1.0)"
        after:  "MCP_VERTEX_VERSION = @mcp-vertex/core/package.json#version (real)"
    - tests:
        - packages/core/tests/src/lib/version.spec.ts
        - plugins/error-reporting/tests/src/lib/report-builder.spec.ts
    - cross-check: "issue real con version '1.4.2' coincide con packages/core/package.json"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track D.
- **Auditoría legada**: §4 ER2-003.
- **Hermanas**: `x00245` (provenance), `x00236` (internalOnly:false), `t00009` (adversarial).
- **Predecesora**: `x00214` (DTO seguro).
- **Nota**: aunque es P0 en este plan, no hay riesgo legal directo. La prioridad alta viene de mantener Track D completo y consistente.
