---
id: x00242
title: "context-for-change — usar SafeWorkspaceReader; eliminar normalizePath vulnerable (FS2-001)"
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
    section: "§5 FS2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00241 # SafeWorkspaceReader API (predecesor)
    - x00243 # impact-analysis containment (hermano)
    - i00004 # lint arquitectónico (hermano)
    - f00165 # context-for-change (plugin afectado)
shipped-in:
  - 7eea421d # fix(filesystem): x00242 — route context-for-change through safe reader
  - 67a1dd33 # test(security): close FS2-001/FS2-002 regression gaps in containment coverage
---

# x00242 — context-for-change: usar SafeWorkspaceReader

## Goal

`plugins/context-for-change/src/lib/services/context-for-change.service.ts` contiene un patrón vulnerable:

```ts
function normalizePath(input: string, workspaceRootAbs: string): string {
  if (isAbsolute(input)) {
    const prefix = `${workspaceRootAbs}/`;
    return input.startsWith(prefix) ? input.slice(prefix.length) : input;
    //                                     ↑ si está fuera, queda ABSOLUTO
  }
  return input;
}

async readSource(filePath: string): Promise<string> {
  const normalized = normalizePath(filePath, this.workspaceRootAbs);
  const resolved = resolve(workspaceRootAbs, filePath);
  return await readFile(resolved, 'utf8');
  //                  ↑ si filePath es absoluto y exterior, abre archivo de fuera
}
```

Un caller puede pasar `/otro/proyecto/private.ts` y el servicio lo lee, extrae símbolos, devuelve metadatos derivados.

Reglas violadas: R5.1 (invariantes como APIs), §5 FS2-001.


(Ver `x00241` para el patrón general; este es el caso concreto en `context-for-change`.)

Reproducción:

```ts
test('context-for-change rejects /outside/secret.ts', async () => {
  const service = new ContextForChangeService({ workspaceRoot: '/tmp/ws' });
  await expect(service.readSource('/outside/secret.ts'))
    .rejects.toThrow(/workspace containment/i);
});
// ↑ falla en HEAD porque el patrón actual acepta el path
```


`CONFIRMADO POR CÓDIGO` (FS2-001).

## Why

- **Seguridad**: agentes externos pueden leer archivos de otros proyectos a través de `context_for_change`.
- **Privacidad**: código del proyecto puede filtrarse vía metadatos derivados (símbolos, referencias).
- **Estabilidad**: paths arbitrarios del usuario pueden provocar crashes.


- **Class C** (project data): paths, filenames, contenido — todos pueden fugarse.
- Riesgo legal si el caller es un agente externo y el workspace contiene código de cliente.


Cero. No cambia tools ni schemas.

## Non-goals

**Permitido**:

- `plugins/context-for-change/src/lib/services/context-for-change.service.ts` (migrar a `SafeWorkspaceReader`).
- `plugins/context-for-change/src/lib/**` (cualquier archivo que importe `node:fs/promises`).
- `plugins/context-for-change/tests/**` (nuevos tests adversariales + actualización de existentes).
- Documentación: `docs/mcp-vertex/plugins/context-for-change.md` (sección "Filesystem safety").

**No permitido**:

- Cambios de comportamiento observable más allá de "rechazar paths exteriores".
- Reescritura de la lógica de extracción de símbolos.
- Cambios en otros plugins.


- API `SafeWorkspaceReader` (`x00241`).
- Lint arquitectónico (`i00004`).
- Cambios en `impact-analysis` (`x00243`).

## Architecture

### 1. Reemplazar `normalizePath` por `resolve` de `SafeWorkspaceReader`

```ts
// plugins/context-for-change/src/lib/services/context-for-change.service.ts (refactor)
import { SafeWorkspaceReader, WorkspaceContainmentError } from '@mcp-vertex/core';

export class ContextForChangeService {
  private readonly reader: SafeWorkspaceReader;

  constructor(private readonly deps: { workspaceRoot: string; /* ...otros */ }) {
    this.reader = new SafeWorkspaceReader(deps.workspaceRoot);
  }

  /** Antes: normalizePath + readFile */
  async readSource(filePath: string): Promise<string> {
    try {
      const result = await this.reader.readText(filePath);
      return result.content;
    } catch (err) {
      if (err instanceof WorkspaceContainmentError) {
        // Mapear a error del plugin con mensaje útil para el caller.
        throw new ContextForChangeError({
          kind: 'outside-workspace',
          message: `Path "${filePath}" is outside the workspace.`,
          originalPath: filePath,
          workspaceRoot: this.deps.workspaceRoot,
        });
      }
      throw err;
    }
  }
}
```

### 2. Eliminar `normalizePath` local

```diff
- function normalizePath(input: string, workspaceRootAbs: string): string {
-   if (isAbsolute(input)) {
-     const prefix = `${workspaceRootAbs}/`;
-     return input.startsWith(prefix) ? input.slice(prefix.length) : input;
-   }
-   return input;
- }
```

### 3. Sustituir cualquier `readFile` directo

Buscar en `plugins/context-for-change/src/lib/**`:

```bash
grep -rn "from 'node:fs/promises'" plugins/context-for-change/src
grep -rn "from 'node:fs'" plugins/context-for-change/src
```

Cada hit se reemplaza por una llamada al reader (a menos que sea operación interna sin path input, p. ej. escribir un report propio del plugin).

### 4. Tests adversariales nuevos

```ts
// plugins/context-for-change/tests/src/context-for-change.tool.spec.ts
import { ContextForChangeService } from '../../../../src/lib/services/context-for-change.service';

describe('context-for-change — workspace containment', () => {
  const service = new ContextForChangeService({ workspaceRoot: '/tmp/test-ws' });

  const adversarialPaths = [
    '../outside.ts',
    '/absolute/outside.ts',
    '/tmp/test-ws-secret/file.ts',  // prefix collision
    '/tmp/other-project/private.ts',
    '.git/HEAD',
    '.env',
    'node_modules/foo/index.js',
    'tests/../../outside.ts',
    'tests/\u0000../../outside.ts',  // null byte
  ];

  for (const p of adversarialPaths) {
    it(`rejects "${p}"`, async () => {
      await expect(service.readSource(p)).rejects.toThrow(/outside/i);
    });
  }

  it('reads legitimate workspace file', async () => {
    // crear /tmp/test-ws/file.ts antes del test
    await expect(service.readSource('file.ts')).resolves.toContain('export');
  });
});
```

### 5. Symlink tests

```ts
describe('context-for-change — symlinks', () => {
  it('rejects symlink inside → target outside', async () => {
    // mklink antes: ln -s /tmp/outside.ts /tmp/test-ws/link-to-outside.ts
    await expect(service.readSource('link-to-outside.ts'))
      .rejects.toThrow(/outside/i);
  });

  it('follows symlink inside → target inside', async () => {
    // mklink antes: ln -s file.ts /tmp/test-ws/link-to-file.ts
    await expect(service.readSource('link-to-file.ts'))
      .resolves.toContain('export');
  });
});
```

### 6. Property tests

```ts
import fc from 'fast-check';

it('any absolute path outside workspace is rejected', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }).filter((s) => !s.startsWith('/tmp/test-ws')), (p) => {
      // Generar paths absolutos fuera del workspace
      const abs = p.startsWith('/') ? p : '/' + p;
      return service.readSource(abs).then(
        () => false,
        (err) => /outside/i.test(err.message),
      );
    }),
  );
});
```

## Slices

- global_gate: type

### S1 — Migración a SafeWorkspaceReader

- **Status**: done
- **Files**: `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/context-for-change/src/lib/**`
- **Gate**: type
- acceptance:
  - "`normalizePath` local eliminado."
  - "Reader inyectado en constructor; todas las lecturas pasan por él."
  - "Errores mapeados a `ContextForChangeError` con info útil."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Tests adversariales

- **Status**: done
- **Files**: `plugins/context-for-change/tests/src/context-for-change.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "≥15 casos adversariales rechazados."
  - "Symlink chain test verde."
  - "Property test verde."

### S3 — Documentación

- **Status**: done
- **Files**: `docs/mcp-vertex/plugins/context-for-change.md`
- **Gate**: type
- acceptance:
  - "Sección 'Filesystem safety' explica comportamiento y casos rechazados."

## Acceptance

- **Unit**: actualizar `plugins/context-for-change/tests/src/context-for-change.tool.spec.ts` con ≥15 casos adversariales.
- **Integration**: tests con filesystem real (`mklink`, cleanup).
- **Property**: ≥1 property test sobre paths adversariales.


- [ ] `normalizePath` local eliminado; todas las lecturas pasan por `SafeWorkspaceReader`.
- [ ] No quedan `import` directos de `node:fs/promises#readFile` en el plugin (excepto allowlist documentada si existe necesidad legítima).
- [ ] Suite adversarial verde: ≥15 casos rechazados.
- [ ] Symlink chain (dentro→fuera) rechazado.
- [ ] Prefix collision detectado.
- [ ] Reserved paths (`.git`, `.env`, `node_modules`) rechazados.
- [ ] Documentation: `docs/mcp-vertex/plugins/context-for-change.md` explica el comportamiento de filesystem safety.
- [ ] `bun run validate` verde.


- `normalizePath` local eliminado.
- Reader inyectado; todas las lecturas por `SafeWorkspaceReader`.
- ≥15 tests adversariales verdes.
- Documentación actualizada.

---

## Notes

- **Lint arquitectónico** (`i00004`): bloquea nuevos `readFile` directos en el plugin.
- **Property test**: cualquier input absoluto fuera del workspace es rechazado.
- **Snapshot del error**: `ContextForChangeError` no filtra el contenido del archivo exterior (solo el path original).


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - plugins/context-for-change/src/lib/services/context-for-change.service.ts
        - plugins/context-for-change/tests/...
    - before/after:
        before: "normalizePath local con escape; readFile directo"
        after:  "SafeWorkspaceReader; sin imports directos de node:fs/promises#readFile"
    - tests: ≥15 unit + ≥1 property
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track A.
- **Auditoría legada**: §5 FS2-001.
- **Predecesora**: `x00241` (API SafeWorkspaceReader).
- **Hermanas**: `x00243` (impact-analysis), `i00004` (lint).
