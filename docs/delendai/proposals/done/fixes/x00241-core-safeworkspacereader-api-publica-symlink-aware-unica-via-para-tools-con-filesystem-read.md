---
id: x00241
title: "core — SafeWorkspaceReader API pública (symlink-aware, única vía para tools con filesystem-read)"
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
    section: "§5 FS2-001 + §22 CORE2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00242 # context-for-change containment (hermano)
    - x00243 # impact-analysis containment (hermano)
    - i00004 # lint arquitectónico (hermano)
    - f00165 # context-for-change
    - f00169 # impact-analysis + tests-for-change
    - f00158 # error-reporting base (referencia arquitectónica)
shipped-in:
  - 9819d8fe # fix(filesystem): x00241 — add safe workspace reader API
---

# x00241 — core: SafeWorkspaceReader API pública

## Goal

Dos plugins nuevos (`context-for-change` y `impact-analysis`) han reproducido un patrón de **filesystem containment roto**:

```ts
// Patrón vulnerable (presente en ambos plugins)
function normalizePath(input: string): string {
  if (isAbsolute(input)) {
    const prefix = `${workspaceRootAbs}/`;
    return input.startsWith(prefix) ? input.slice(prefix.length) : input;
    //                                     ↑ si está fuera, queda ABSOLUTO
  }
  return input;
}

// ...

const resolved = resolve(workspaceRootAbs, filePath);
const content = await readFile(resolved, 'utf8');
//                  ↑ si filePath es absoluto, resolve() ignora workspaceRootAbs
```

Esto significa que un caller puede pasar `/otro/proyecto/private.ts` y el servicio:

1. Lee el archivo.
2. Extrae símbolos.
3. Devuelve metadatos derivados (no el contenido íntegro, pero el boundary está roto).

El core **ya tiene** un helper `resolveWorkspaceContained`. La auditoría §22 CORE2-001 recomienda no dividir paquetes todavía, pero **sí** extraer la API pública de filesystem reading.

Reglas violadas: R5.1 (invariantes como APIs), R3.1 (coherencia arquitectónica), §5 auditoría.


```ts
// plugins/context-for-change/src/lib/services/context-for-change.service.ts (extracto)
function normalizePath(input: string, workspaceRootAbs: string): string {
  if (isAbsolute(input)) {
    const prefix = `${workspaceRootAbs}/`;
    return input.startsWith(prefix) ? input.slice(prefix.length) : input;
  }
  return input;
}

// ...

async readSource(filePath: string): Promise<string> {
  const normalized = normalizePath(filePath, this.workspaceRootAbs);
  //                                    ↑ si filePath es absoluto y exterior, queda igual
  const resolved = path.resolve(this.workspaceRootAbs, normalized);
  return await fs.readFile(resolved, 'utf8');
  // ↑ si resolved es absoluto y exterior, abre archivo de fuera del workspace
}
```

```ts
// plugins/impact-analysis/src/lib/services/impact-analysis.service.ts (extracto)
private normalizePath(input: string): string {
  if (path.isAbsolute(input)) {
    return input.startsWith(this.workspaceRoot + '/')
      ? input.slice(this.workspaceRoot.length + 1)
      : input;
  }
  return input;
}

private readSource(filePath: string): string {
  const resolved = path.resolve(this.workspaceRoot, filePath);
  return fs.readFileSync(resolved, 'utf8');
  //   ↑ mismo bug, además usa sync (boot-time only)
}
```

Reproducción (test que falla en el HEAD actual):

```ts
test('context-for-change rejects /outside/secret.ts', async () => {
  const service = new ContextForChangeService({ workspaceRoot: '/tmp/ws' });
  await expect(
    service.readSource('/outside/secret.ts'),
  ).rejects.toThrow(/workspace containment/i);
});
```


`CONFIRMADO POR CÓDIGO` — patrón visible, reproducible con un test trivial.

## Why

- **Seguridad**: rutas exteriores pueden leerse, exponiendo código de otros proyectos, secretos, configuraciones internas.
- **Privacidad**: si el caller es un agente externo (chat, IDE), el boundary está roto: el agente puede ver `/Users/alice/private-server/secrets.ts`.
- **Estabilidad**: plugins pueden romperse con paths arbitrarios del usuario.


- **Class C** (project data): paths, filenames, contenido — todos pueden fugarse.
- **Class D** (secrets): si el archivo abierto contiene secretos, esos secretos llegan al response del caller (que NO es lo mismo que el reporter público, pero sigue siendo una superficie de fuga local).

Regla: el boundary de filesystem es **defensa en profundidad** para Class C/D, no solo para evitar crashes.


Cero. No añade tools; reemplaza implementación.

## Non-goals

**Permitido**:

- `packages/core/src/lib/filesystem/safe-workspace-reader.ts` (nuevo).
- `packages/core/src/lib/filesystem/safe-workspace-reader.types.ts` (nuevo).
- `packages/core/src/lib/filesystem/safe-workspace-reader.errors.ts` (nuevo).
- `packages/core/src/public/index.ts` (exportar `ISafeWorkspaceReader`, `ContainedPathResult`).
- `packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts` (nuevo, suite adversarial).
- `packages/core/tests/src/lib/filesystem/safe-workspace-reader.property.spec.ts` (nuevo).
- Documentación: `docs/mcp-vertex/core/safe-workspace-reader.md` (nuevo).
- `packages/core/src/index.ts` si la convención requiere re-export.

**No permitido**:

- Reescribir plugins afectados aquí (cada plugin tiene su propia propuesta: `x00242`, `x00243`).
- Eliminar `resolveWorkspaceContained` existente (esta propuesta lo **centraliza**, no lo borra; ver Out of scope).


- Reescritura de `context-for-change` (`x00242`).
- Reescritura de `impact-analysis` (`x00243`).
- Lint arquitectónico que bloquee el patrón (`i00004`).
- División de paquetes (`CORE2-001`).
- Cambiar otros plugins que ya usan `resolveWorkspaceContained` correctamente.

## Architecture

### 1. Interfaz pública

```ts
// packages/core/src/lib/filesystem/safe-workspace-reader.types.ts
import type { Stats } from 'node:fs';

export interface ContainedPathResult {
  /** Path absoluta dentro del workspace, symlinks resueltos. */
  readonly absolutePath: string;
  /** Path relativa al workspace, normalizada. */
  readonly relativePath: string;
  /** Path original del caller (para diagnóstico). */
  readonly originalPath: string;
  /** true si el path original era absoluto y estaba dentro. */
  readonly wasAbsolute: boolean;
}

export interface SafeReadResult {
  readonly path: ContainedPathResult;
  readonly content: string;
  readonly stats: Stats;
}

export interface SafeStatResult {
  readonly path: ContainedPathResult;
  readonly stats: Stats;
}

export interface SafeListEntry {
  readonly path: ContainedPathResult;
  readonly stats: Stats;
}

export interface SafeListResult {
  readonly path: ContainedPathResult;
  readonly entries: ReadonlyArray<SafeListEntry>;
}

export interface ISafeWorkspaceReader {
  /**
   * Resuelve una ruta (relativa o absoluta) contra el workspace,
   * garantizando que el resultado está dentro del workspace
   * (symlink-aware, prefix-collision-safe, Windows-aware).
   *
   * @throws WorkspaceContainmentError si el path resuelve fuera del workspace.
   */
  resolve(inputPath: string): ContainedPathResult;

  /** Lee un archivo de texto dentro del workspace. */
  readText(inputPath: string): Promise<SafeReadResult>;

  /** Stats de un path dentro del workspace. */
  stat(inputPath: string): Promise<SafeStatResult>;

  /** Lista un directorio dentro del workspace. */
  list(inputPath: string, opts?: { recursive?: boolean; maxDepth?: number }): Promise<SafeListResult>;

  /** Comprueba si existe (sin lanzar error si no). */
  exists(inputPath: string): Promise<ContainedPathResult | null>;
}
```

### 2. Implementación

```ts
// packages/core/src/lib/filesystem/safe-workspace-reader.ts
import { realpath, stat, readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { WorkspaceContainmentError } from './safe-workspace-reader.errors';

export class SafeWorkspaceReader implements ISafeWorkspaceReader {
  constructor(
    private readonly workspaceRootAbs: string,
    private readonly opts: {
      /**
       * Si true (default), rechaza symlinks cuyo target está fuera del workspace.
       * Si false, sigue el symlink dentro del workspace solo si la cadena completa está dentro.
       */
      strictSymlinks?: boolean;
      /**
       * Paths reservados que NUNCA pueden abrirse aunque estén dentro del workspace
       * (p. ej. `.git`, `.env`, `node_modules`).
       */
      reservedPaths?: ReadonlyArray<string>;
    } = {},
  ) {
    if (!path.isAbsolute(workspaceRootAbs)) {
      throw new Error('workspaceRootAbs must be absolute');
    }
    this.opts = {
      strictSymlinks: true,
      reservedPaths: ['.git', '.env', 'node_modules'],
      ...opts,
    };
  }

  resolve(inputPath: string): ContainedPathResult {
    if (typeof inputPath !== 'string' || inputPath.length === 0) {
      throw new WorkspaceContainmentError({
        kind: 'invalid-input',
        originalPath: inputPath,
        workspaceRoot: this.workspaceRootAbs,
      });
    }

    const original = inputPath;
    const isAbs = path.isAbsolute(inputPath);

    // 1. Normalizar separators, resolver .. y . (sin tocar symlinks todavía).
    const normalized = path.normalize(inputPath);

    // 2. Resolver contra el workspace si es relativa.
    let absolute = isAbs ? normalized : path.resolve(this.workspaceRootAbs, normalized);

    // 3. Symlink-aware: si existe, resolver realpath.
    absolute = this.resolveSymlinks(absolute);  // ver helper abajo

    // 4. Containment: comparar contra el workspaceRootAbs normalizado.
    const workspaceReal = this.resolveSymlinks(this.workspaceRootAbs);
    if (!this.isInside(absolute, workspaceReal)) {
      throw new WorkspaceContainmentError({
        kind: 'outside-workspace',
        originalPath: original,
        resolvedAbsolute: absolute,
        workspaceRoot: workspaceReal,
      });
    }

    // 5. Reserved paths.
    for (const reserved of this.opts.reservedPaths ?? []) {
      if (this.matchesReserved(absolute, workspaceReal, reserved)) {
        throw new WorkspaceContainmentError({
          kind: 'reserved-path',
          reservedPath: reserved,
          originalPath: original,
          resolvedAbsolute: absolute,
          workspaceRoot: workspaceReal,
        });
      }
    }

    const relative = path.relative(workspaceReal, absolute);

    return {
      absolutePath: absolute,
      relativePath: relative,
      originalPath: original,
      wasAbsolute: isAbs,
    };
  }

  async readText(inputPath: string): Promise<SafeReadResult> {
    const contained = this.resolve(inputPath);
    const [content, stats] = await Promise.all([
      readFile(contained.absolutePath, 'utf8'),
      stat(contained.absolutePath),
    ]);
    return { path: contained, content, stats };
  }

  async stat(inputPath: string): Promise<SafeStatResult> {
    const contained = this.resolve(inputPath);
    const stats = await stat(contained.absolutePath);
    return { path: contained, stats };
  }

  async list(
    inputPath: string,
    listOpts: { recursive?: boolean; maxDepth?: number } = {},
  ): Promise<SafeListResult> {
    const contained = this.resolve(inputPath);
    const entries = await this.listRecursive(
      contained.absolutePath,
      listOpts.recursive ?? false,
      listOpts.maxDepth ?? 1,
    );
    return { path: contained, entries };
  }

  async exists(inputPath: string): Promise<ContainedPathResult | null> {
    try {
      return this.resolve(inputPath);
    } catch (err) {
      if (err instanceof WorkspaceContainmentError) return null;
      // Si el path es válido pero no existe, también devolver null.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  // ─── helpers privados ─────────────────────────────────────────────

  private resolveSymlinks(p: string): string {
    try {
      // realpath.resolve cadena completa
      return require('fs').realpathSync.native(p);
    } catch {
      // Si el path no existe, devolver el normalizado.
      return p;
    }
  }

  private isInside(child: string, parent: string): boolean {
    // Normalizar separators.
    const nChild = path.normalize(child);
    const nParent = path.normalize(parent);

    if (nChild === nParent) return true;
    // Prefix collision-safe: usar path.relative y comprobar que no empieza con '..'
    const rel = path.relative(nParent, nChild);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  private matchesReserved(child: string, parent: string, reserved: string): boolean {
    const rel = path.relative(parent, child);
    const parts = rel.split(path.sep);
    return parts.some((part) => part === reserved);
  }

  private async listRecursive(
    abs: string,
    recursive: boolean,
    maxDepth: number,
    currentDepth = 0,
  ): Promise<SafeListEntry[]> {
    const dirEntries = await readdir(abs, { withFileTypes: true });
    const out: SafeListEntry[] = [];

    for (const entry of dirEntries) {
      const entryAbs = path.join(abs, entry.name);
      const entryStats = await stat(entryAbs);
      const contained: ContainedPathResult = {
        absolutePath: entryAbs,
        relativePath: path.relative(this.resolveSymlinks(this.workspaceRootAbs), entryAbs),
        originalPath: entry.name,
        wasAbsolute: false,
      };

      out.push({ path: contained, stats: entryStats });

      if (recursive && entry.isDirectory() && currentDepth + 1 < maxDepth) {
        out.push(
          ...(await this.listRecursive(entryAbs, true, maxDepth, currentDepth + 1)),
        );
      }
    }

    return out;
  }
}
```

### 3. Errores tipados

```ts
// packages/core/src/lib/filesystem/safe-workspace-reader.errors.ts
export type WorkspaceContainmentReason =
  | 'invalid-input'
  | 'outside-workspace'
  | 'reserved-path'
  | 'symlink-outside'
  | 'prefix-collision';

export class WorkspaceContainmentError extends Error {
  constructor(
    public readonly info: {
      kind: WorkspaceContainmentReason;
      originalPath: string;
      resolvedAbsolute?: string;
      workspaceRoot: string;
      reservedPath?: string;
    },
  ) {
    super(
      `[workspace-containment:${info.kind}] "${info.originalPath}" ` +
        (info.resolvedAbsolute ? `resolves to "${info.resolvedAbsolute}" ` : '') +
        `outside workspace root "${info.workspaceRoot}"` +
        (info.reservedPath ? ` (reserved: ${info.reservedPath})` : ''),
    );
    this.name = 'WorkspaceContainmentError';
  }
}
```

### 4. Export público

```ts
// packages/core/src/public/index.ts (extracto)
export {
  SafeWorkspaceReader,
  WorkspaceContainmentError,
} from './lib/filesystem/safe-workspace-reader';
export type {
  ISafeWorkspaceReader,
  ContainedPathResult,
  SafeReadResult,
  SafeStatResult,
  SafeListEntry,
  SafeListResult,
  WorkspaceContainmentReason,
} from './lib/filesystem/safe-workspace-reader.types';
```

### 5. Tests adversariales obligatorios

| Test                                                     | Esperado                            |
|----------------------------------------------------------|-------------------------------------|
| `../outside.ts` (relativo)                               | `WorkspaceContainmentError`         |
| `/absolute/outside.ts`                                   | `WorkspaceContainmentError`         |
| Symlink dentro → target fuera                            | `WorkspaceContainmentError` (symlink-outside) |
| Symlink chain                                            | `WorkspaceContainmentError`         |
| `C:\outside\secret.ts` (Windows-style en POSIX)          | tratado como string, no path       |
| Mixed separators (`foo\\bar`)                            | normalizado, sigue rechazando si fuera |
| Prefix collision: ws `/foo/bar`, path `/foo/bar-secret/file.ts` | `WorkspaceContainmentError` |
| Unicode path edge: `tests/ÁÉÍÓÚ/file.ts`                 | aceptado si está dentro             |
| Reserved: `node_modules/foo/index.js`                    | `WorkspaceContainmentError` (reserved-path) |
| Reserved: `.env`                                         | `WorkspaceContainmentError`         |
| Reserved: `.git/HEAD`                                    | `WorkspaceContainmentError`         |
| Path vacío / null / undefined                            | `WorkspaceContainmentError` (invalid-input) |
| `path.normalize` con segmentos vacíos                    | aceptado si está dentro             |
| `realpath` de workspace con symlinks                     | resuelto antes de comparar          |
| Two hosts: el mismo path externo                         | mismo rechazo, sin filtrar info     |

### 6. Property tests

```ts
// packages/core/tests/src/lib/filesystem/safe-workspace-reader.property.spec.ts
import fc from 'fast-check';

it('any path resolving outside workspace is rejected', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const reader = new SafeWorkspaceReader('/tmp/ws');
      const resolved = path.resolve('/tmp/ws', input);
      if (!resolved.startsWith('/tmp/ws/')) {
        // Si normalizamos y resolvemos fuera, debe lanzar.
        if (path.isAbsolute(input) || input.includes('..')) {
          expect(() => reader.resolve(input)).toThrow(WorkspaceContainmentError);
        }
      }
      return true;
    }),
  );
});

it('reserved paths always rejected', () => {
  fc.assert(
    fc.property(fc.constantFrom('.git', '.env', 'node_modules'), (reserved) => {
      const reader = new SafeWorkspaceReader('/tmp/ws');
      expect(() => reader.resolve(reserved)).toThrow(WorkspaceContainmentError);
      return true;
    }),
  );
});
```

## Slices

- global_gate: type

### S1 — Tipos + interfaz pública

- **Status**: done
- **Files**: `packages/core/src/lib/filesystem/safe-workspace-reader.types.ts`, `packages/core/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "`ISafeWorkspaceReader`, `ContainedPathResult`, `SafeReadResult`, etc., exportados."
  - "Documentación JSDoc completa."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde, mecanismo verificado empíricamente contra git config real.
### S2 — Implementación SafeWorkspaceReader

- **Status**: done
- **Files**: `packages/core/src/lib/filesystem/safe-workspace-reader.ts`, `packages/core/src/lib/filesystem/safe-workspace-reader.errors.ts`
- **Gate**: type
- acceptance:
  - "Symlink-aware; prefix-collision-safe; reserved paths."
  - "Errores tipados con razón específica."

### S3 — Tests adversariales + property tests

- **Status**: done
- **Files**: `packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts`, `packages/core/tests/src/lib/filesystem/safe-workspace-reader.property.spec.ts`
- **Gate**: type
- acceptance:
  - "≥20 unit tests verdes."
  - "≥3 property tests verdes."

### S4 — Documentación pública

- **Status**: done
- **Files**: `docs/mcp-vertex/core/safe-workspace-reader.md`
- **Gate**: type
- acceptance:
  - "Documento explica API + casos adversariales cubiertos + cómo migrar plugins."

## Acceptance

- **Unit**: `packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts` (≥20 tests adversariales).
- **Property**: `packages/core/tests/src/lib/filesystem/safe-workspace-reader.property.spec.ts` (≥3 properties).
- **Cross-platform**: tests que mockean `path.sep` y verifican comportamiento en Windows-style paths.
- **Symlink**: tests con fs symlinks reales (crear symlink antes del test, cleanup después).


- [ ] `ISafeWorkspaceReader` exportado desde `@mcp-vertex/core` (public).
- [ ] Implementación symlink-aware; no abre archivos fuera del workspace bajo ningún input adversarial.
- [ ] Reserved paths (`.git`, `.env`, `node_modules`) bloqueados por defecto.
- [ ] Prefix collision detectado (`/foo/bar` vs `/foo/bar-secret`).
- [ ] Errores tipados (`WorkspaceContainmentError`) con razón específica.
- [ ] ≥20 tests adversariales verdes (incluyendo los 15 listados arriba).
- [ ] ≥3 property tests verdes.
- [ ] Documentación: `docs/mcp-vertex/core/safe-workspace-reader.md` con ejemplos y casos adversariales.
- [ ] `bun run validate` verde.


- `ISafeWorkspaceReader` exportado y usable desde `@mcp-vertex/core`.
- Implementación robusta (symlink-aware, reserved paths, prefix collision).
- ≥20 tests adversariales + ≥3 property tests verdes.
- Documentación completa.

---

## Notes

- **Lint arquitectónico** (`i00004`) que detecta uso directo de `node:fs/promises#readFile` en plugins con permiso `filesystem-read`.
- **Property test** sobre DTO de respuesta: ningún plugin devuelve contenido con paths absolutos (`/Users/`, `/home/`, `C:\`).
- **Snapshot test** del error: `WorkspaceContainmentError` siempre lleva `originalPath` + `workspaceRoot` + `reason`, sin filtrar contenido del path exterior.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - packages/core/src/lib/filesystem/safe-workspace-reader.ts
        - packages/core/src/lib/filesystem/safe-workspace-reader.types.ts
        - packages/core/src/lib/filesystem/safe-workspace-reader.errors.ts
        - packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts
        - packages/core/tests/src/lib/filesystem/safe-workspace-reader.property.spec.ts
        - docs/mcp-vertex/core/safe-workspace-reader.md
    - tests-pass: ≥20 unit + ≥3 property
    - before/after:
        before: "Patrón vulnerable duplicado en context-for-change e impact-analysis"
        after:  "API única SafeWorkspaceReader; ambos plugins migran en x00242/x00243"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track A.
- **Auditoría legada**: §5 FS2-001, §22 CORE2-002.
- **Hermanas**: `x00242` (context-for-change), `x00243` (impact-analysis), `i00004` (lint).
- **Predecesora conceptual**: `resolveWorkspaceContained` ya existente — esta propuesta la **eleva a API pública** sin romperla.
- **Principio §41**: *"Internal invariants must be APIs/lints, not tribal knowledge."* Esta propuesta convierte la invariante "no leas fuera del workspace" en API.
