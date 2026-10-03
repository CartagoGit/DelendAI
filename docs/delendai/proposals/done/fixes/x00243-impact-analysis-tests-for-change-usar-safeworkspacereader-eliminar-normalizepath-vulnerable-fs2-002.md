---
id: x00243
title: "impact-analysis + tests-for-change — usar SafeWorkspaceReader; eliminar normalizePath vulnerable (FS2-002)"
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
priority: P1
classification: CONFIRMADO POR CÓDIGO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§5 FS2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00241 # SafeWorkspaceReader API (predecesor)
    - x00242 # context-for-change containment (hermano)
    - i00004 # lint arquitectónico (hermano)
    - f00169 # impact-analysis + tests-for-change (plugin afectado)
shipped-in:
  - b3c72f60 # fix(filesystem): x00243 — route impact-analysis through safe reader
  - 07bc49ac # fix(filesystem): x00243 — route impact-analysis through safe reader
  - 67a1dd33 # test(security): close FS2-001/FS2-002 regression gaps in containment coverage
---

# x00243 — impact-analysis + tests-for-change: usar SafeWorkspaceReader

## Goal

`plugins/impact-analysis/src/lib/services/impact-analysis.service.ts` tiene el mismo patrón vulnerable que `context-for-change`:

```ts
private normalizePath(input: string): string {
  if (path.isAbsolute(input)) {
    return input.startsWith(this.workspaceRoot + '/')
      ? input.slice(this.workspaceRoot.length + 1)
      : input;
    //                                     ↑ si está fuera, queda ABSOLUTO
  }
  return input;
}

private readSource(filePath: string): string {
  const resolved = path.resolve(this.workspaceRoot, filePath);
  return fs.readFileSync(resolved, 'utf8');
  //   ↑ mismo bug + uso de sync (boot-time only)
}
```

El mismo bug afecta a:

- `impact_analyze`
- `tests_for_change`
- Cualquier helper que reutilice `computeImpactAnalysis`

Reglas violadas: R5.1, §5 FS2-002.


(Ver `x00241` para el patrón general; este es el caso concreto en `impact-analysis`.)

Reproducción:

```ts
test('impact-analysis rejects /outside/secret.ts', async () => {
  const service = new ImpactAnalysisService({ workspaceRoot: '/tmp/ws' });
  await expect(
    service.computeImpact({ files: ['/outside/secret.ts'] }),
  ).rejects.toThrow(/workspace containment/i);
});
// ↑ falla en HEAD porque el patrón actual acepta el path
```


`CONFIRMADO POR CÓDIGO` (FS2-002).

## Why

Idéntico a `x00242` pero en el dominio de análisis de impacto:

- Un caller puede inyectar paths exteriores y obtener análisis de archivos ajenos al workspace.
- El resultado puede incluir símbolos, referencias y tests relacionados — todo extraído de código del caller o de terceros.
- Tests seleccionados pueden disparar ejecuciones no intencionadas si `tests_for_change` devuelve paths a ejecutar.


- **Class C** (project data): paths, filenames, símbolos, referencias — todos pueden fugarse.
- Mayor superficie que `context-for-change`: `impact_analyze` se usa típicamente como input para `tests_for_change`, que **ejecuta** código.


Cero. No cambia tools ni schemas.

## Non-goals

**Permitido**:

- `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`.
- `plugins/impact-analysis/src/lib/**` (cualquier archivo que importe `node:fs/promises`).
- `plugins/impact-analysis/tests/**` (nuevos tests adversariales + actualización de existentes).
- Documentación: `docs/mcp-vertex/plugins/impact-analysis.md` (sección "Filesystem safety").

**No permitido**:

- Cambios en la lógica lexical/semantic de análisis (IMP2-002).
- Cambios en el benchmark de test selection (IMP2-003).
- Cambios en otros plugins.


- API `SafeWorkspaceReader` (`x00241`).
- Lint arquitectónico (`i00004`).
- Cambios en `context-for-change` (`x00242`).

## Architecture

### 1. Reemplazar `normalizePath` por `resolve` de `SafeWorkspaceReader`

```ts
// plugins/impact-analysis/src/lib/services/impact-analysis.service.ts (refactor)
import { SafeWorkspaceReader, WorkspaceContainmentError } from '@mcp-vertex/core';

export class ImpactAnalysisService {
  private readonly reader: SafeWorkspaceReader;

  constructor(private readonly deps: { workspaceRoot: string; /* ...otros */ }) {
    this.reader = new SafeWorkspaceReader(deps.workspaceRoot);
  }

  /** Antes: normalizePath local + readFileSync */
  private async readSource(filePath: string): Promise<string> {
    const contained = this.reader.resolve(filePath);
    // ↑ lanza WorkspaceContainmentError si fuera; no llega a readFile
    const result = await this.reader.readText(contained.relativePath);
    return result.content;
  }

  /** Antes: normalizePath local */
  private normalizePath(input: string): string {
    return this.reader.resolve(input).relativePath;
    // ↑ si está fuera, lanza; los callers deben envolver en try/catch
  }
}
```

### 2. Eliminar `normalizePath` local

```diff
- private normalizePath(input: string): string {
-   if (path.isAbsolute(input)) {
-     return input.startsWith(this.workspaceRoot + '/')
-       ? input.slice(this.workspaceRoot.length + 1)
-       : input;
-   }
-   return input;
- }
```

### 3. Sustituir `readFileSync` por versión async

```diff
- private readSource(filePath: string): string {
-   const resolved = path.resolve(this.workspaceRoot, filePath);
-   return fs.readFileSync(resolved, 'utf8');   // ← sync (prohibido en hot path)
- }
+ private async readSource(filePath: string): Promise<string> {
+   const contained = this.reader.resolve(filePath);
+   const result = await this.reader.readText(contained.relativePath);
+   return result.content;
+ }
```

### 4. Manejo de errores en callers

Los callers de `computeImpact` y `computeTestsForChange` deben:

```ts
try {
  const result = service.computeImpact({ files });
  // ...
} catch (err) {
  if (err instanceof WorkspaceContainmentError) {
    // Devolver respuesta estructurada al caller de la tool:
    return {
      ok: false,
      kind: 'workspace-containment',
      rejectedPaths: [err.info.originalPath],
      workspaceRoot: err.info.workspaceRoot,
    };
  }
  throw err;
}
```

### 5. Tests adversariales nuevos

```ts
// plugins/impact-analysis/tests/src/lib/services/impact-analysis.service.spec.ts
import { ImpactAnalysisService } from '../../../../src/lib/services/impact-analysis.service';

describe('impact-analysis — workspace containment', () => {
  const service = new ImpactAnalysisService({ workspaceRoot: '/tmp/test-ws' });

  const adversarialFiles = [
    ['../outside.ts'],
    ['/absolute/outside.ts'],
    ['/tmp/test-ws-secret/file.ts'],  // prefix collision
    ['/tmp/other-project/private.ts'],
    ['.git/HEAD'],
    ['.env'],
    ['node_modules/foo/index.js'],
    ['tests/../../outside.ts'],
  ];

  for (const files of adversarialFiles) {
    it(`rejects files: ${JSON.stringify(files)}`, async () => {
      await expect(service.computeImpact({ files }))
        .rejects.toThrow(/outside/i);
    });
  }

  it('processes legitimate workspace files', async () => {
    // crear archivos válidos antes del test
    const result = await service.computeImpact({ files: ['src/index.ts'] });
    expect(result.changedSymbols.length).toBeGreaterThanOrEqual(0);
  });
});
```

### 6. Symlink + property tests

Idénticos a `x00242`, adaptados al dominio de impact-analysis.

## Slices

- global_gate: type

### S1 — Migración a SafeWorkspaceReader

- **Status**: done
- **Files**: `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`, `plugins/impact-analysis/src/lib/**`
- **Gate**: type
- acceptance:
  - "`normalizePath` local eliminado."
  - "`readFileSync` reemplazado por `readText` async."
  - "Errores mapeados a respuestas estructuradas en callers."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Tests adversariales

- **Status**: done
- **Files**: `plugins/impact-analysis/tests/src/impact-analysis.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "≥15 casos adversariales rechazados."
  - "Symlink chain test verde."
  - "Property test verde."

### S3 — Documentación

- **Status**: done
- **Files**: `docs/mcp-vertex/plugins/impact-analysis.md`
- **Gate**: type
- acceptance:
  - "Sección 'Filesystem safety' explica comportamiento."

## Acceptance

- **Unit**: actualizar `plugins/impact-analysis/tests/src/impact-analysis.tool.spec.ts` con ≥15 casos adversariales.
- **Integration**: tests con filesystem real (symlinks, cleanup).
- **Property**: ≥1 property test sobre paths adversariales.
- **E2E**: `impact_analyze` con un path exterior devuelve `workspace-containment` en la respuesta estructurada.


- [ ] `normalizePath` local eliminado.
- [ ] `readFileSync` reemplazado por versión async (cumple R5 de AGENT-BOOTSTRAP: async I/O en hot paths).
- [ ] Reader inyectado; todas las lecturas pasan por `SafeWorkspaceReader`.
- [ ] Suite adversarial verde: ≥15 casos rechazados.
- [ ] Symlink chain (dentro→fuera) rechazado.
- [ ] Reserved paths rechazados.
- [ ] `computeImpact` y `computeTestsForChange` devuelven respuesta estructurada cuando hay containment error (no crash).
- [ ] Documentation: `docs/mcp-vertex/plugins/impact-analysis.md` explica el comportamiento.
- [ ] `bun run validate` verde.


- `normalizePath` local eliminado.
- Reader inyectado; lecturas por `SafeWorkspaceReader`.
- ≥15 tests adversariales verdes.
- Documentación actualizada.

---

## Notes

- **Lint arquitectónico** (`i00004`): bloquea nuevos `readFile` directos en el plugin.
- **Property test**: cualquier input absoluto fuera del workspace es rechazado.
- **Snapshot del error**: el reporte de impacto nunca incluye contenido de archivos exteriores.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - plugins/impact-analysis/src/lib/services/impact-analysis.service.ts
        - plugins/impact-analysis/src/lib/**
        - plugins/impact-analysis/tests/**
    - before/after:
        before: "normalizePath local con escape; readFileSync directo"
        after:  "SafeWorkspaceReader; readFile async; errores estructurados"
    - tests: ≥15 unit + ≥1 property
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track A.
- **Auditoría legada**: §5 FS2-002, §16 IMP2-001.
- **Predecesora**: `x00241` (API).
- **Hermanas**: `x00242` (context-for-change), `i00004` (lint).
