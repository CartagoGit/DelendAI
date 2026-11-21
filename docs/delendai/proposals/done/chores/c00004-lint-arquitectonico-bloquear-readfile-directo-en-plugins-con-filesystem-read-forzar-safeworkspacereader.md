---
id: c00004
title: "lint arquitectónico — bloquear readFile directo en plugins con filesystem-read; forzar SafeWorkspaceReader"
kind: chore
status: done
type: proposal
track: filesystem
date: 2026-08-25
priority: P2
classification: MEJORA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§5 FS2-003 + §22 CORE2-001 (no split) + R5"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00241 # SafeWorkspaceReader API (predecesor)
    - x00242 # context-for-change (consumidor)
    - x00243 # impact-analysis (consumidor)
shipped-in:
  - d1727fe9 # chore(filesystem): c00004 — block direct readFile outside safe reader
---

# i00004 — lint arquitectónico: bloquear readFile directo

## Goal

El bug FS2-001 / FS2-002 fue posible porque dos plugins distintos podían reproducir el patrón vulnerable (`normalizePath` + `readFile` directo) sin que ninguna herramienta automática lo detectara.

`x00241` crea la API correcta y `x00242`/`x00243` migran los plugins. Pero **falta el guard que evita que esto vuelva a pasar**.

Hoy:

- No hay lint que prohíba `readFile` directo en plugins con permiso `filesystem-read`.
- Cualquier agente futuro puede escribir `import { readFile } from 'node:fs/promises'` y reproducir el bug.
- El código de plugins está abierto a edición, pero la **invariante** está solo en documentación tribal.

Reglas violadas: R5.2 (invariantes como lints), §5 FS2-003.


(Ver `x00241`, `x00242`, `x00243` para los casos.)

Hoy el patrón vulnerable está en plugins recién creados (`context-for-change`, `impact-analysis`). El lint habría detectado ambos en cuanto se commitean.


`MEJORA` — propuesta de infraestructura, no fix de bug directo (los fixes son `x00242`/`x00243`).

## Why

- Agentes futuros: no pueden reintroducir el bug accidentalmente.
- Operadores: confianza en que la invariante se mantiene.
- Mantenedores: menos revisión manual.


Cero. Es un guard contra fugas futuras.


Cero.

## Non-goals

**Permitido**:

- `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts` (nuevo).
- `tools/scripts/lint/architecture-readfile-via-safe-reader.script.spec.ts` (nuevo).
- Configuración del runner (p. ej. `tools/scripts/lint/index.ts` o equivalente).
- `package.json` scripts (`lint:architecture-readfile-via-safe-reader`).
- Documentación: `docs/mcp-vertex/contributing/lint-rules.md` (nuevo, si no existe).

**No permitido**:

- Cambios en plugins existentes (sus fixes están en `x00242`/`x00243`).
- Cambios en `SafeWorkspaceReader` mismo.
- Cambios en `core`.


- Lint equivalente para procesos (SafeProcessRunner) — otra propuesta si se quiere.
- Lint equivalente para network (SafeNetworkClient) — otra propuesta.

## Architecture

### 1. Detección

El lint detecta, en cada archivo `.ts` de plugins con permiso `filesystem-read`:

- `import { readFile } from 'node:fs/promises'`
- `import { readFileSync } from 'node:fs'`
- `import { readFile } from 'node:fs'`
- Llamadas a `readFile(...)` o `readFileSync(...)` que reciban un path calculado con `path.resolve(workspaceRoot, ...)` o similar.

```ts
// tools/scripts/lint/filesystem-reader-invariant.script.ts
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { glob } from 'tinyglobby';

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const PLUGIN_ROOT = 'plugins';

const plugins = await loadPluginManifests();

const violations: Violation[] = [];

for (const plugin of plugins) {
  if (!plugin.permissions?.includes('filesystem-read')) continue;

  const srcFiles = await glob(`plugins/${plugin.id}/src/**/*.ts`);

  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Rule 1: import directo de readFile
      if (line.match(/import\s+\{[^}]*readFile[^}]*\}\s+from\s+['"]node:fs(\/promises)?['"]/)) {
        violations.push({
          file,
          line: i + 1,
          rule: 'FS-INVARIANT-001',
          message: 'Direct import of readFile from node:fs. Use @mcp-vertex/core SafeWorkspaceReader.',
        });
      }

      // Rule 2: readFile(...) o readFileSync(...) con path calculado
      if (line.match(/readFileSync?\s*\(/) && !line.includes('// lint-allow-fs')) {
        // Permitido solo si el path es un literal conocido (p. ej. para fixtures internas)
        if (!isLikelyLiteralPath(line)) {
          violations.push({
            file,
            line: i + 1,
            rule: 'FS-INVARIANT-002',
            message: 'readFile/readFileSync call detected. Use @mcp-vertex/core SafeWorkspaceReader.',
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Filesystem reader invariant violations:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  process.exit(1);
}

function isLikelyLiteralPath(line: string): boolean {
  // Permitir readFile de fixtures internas del plugin que son paths literales.
  // p. ej. readFile(new URL('./fixture.ts', import.meta.url), 'utf8')
  return line.includes('import.meta.url') || line.includes('__dirname');
}
```

### 2. Allowlist

Algunos plugins pueden necesitar acceso directo (p. ej. `error-reporting` lee su propio package.json). Allowlist explícita:

```ts
// En cada plugin.manifest.ts:
{
  ...
  "permissions": ["filesystem-read"],
  "lintOverrides": {
    "filesystem-reader-invariant": {
      "allowFiles": [
        "src/lib/report-builder.helper.ts"  // lee su propio package.json
      ],
      "allowReason": "Reads own package.json for version (covered by x00237)."
    }
  }
}
```

El lint respeta esta allowlist **solo si el plugin declara `allowReason`**.

### 3. Tests del lint

```ts
// tools/scripts/lint/filesystem-reader-invariant.spec.ts
import { describe, expect, it } from 'vitest';

describe('filesystem-reader-invariant lint', () => {
  it('flags import of readFile from node:fs in plugin', async () => {
    // crear archivo temporal, ejecutar lint sobre él, esperar violación
  });

  it('flags readFileSync call with computed path', async () => {
    // idem
  });

  it('passes for legitimate usage via SafeWorkspaceReader', async () => {
    // idem
  });

  it('respects allowlist with reason', async () => {
    // idem
  });

  it('rejects allowlist without reason', async () => {
    // idem
  });
});
```

### 4. Integración en CI

```yaml
# .github/workflows/ci.yml (extracto)
- name: Filesystem reader invariant lint
  run: bun run lint:fs-invariant
```

`package.json`:

```json
{
  "scripts": {
    "lint:fs-invariant": "bun tools/scripts/lint/filesystem-reader-invariant.script.ts"
  }
}
```

Añadir a `bun run validate`.

## Slices

- global_gate: type

### S1 — Lint script

- **Status**: done
- **Files**: `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts`
- **Gate**: type
- acceptance:
  - "Detecta imports directos y llamadas."
  - "Allowlist respetada con reason."

### S2 — Tests del lint

- **Status**: done
- **Files**: `tools/scripts/lint/architecture-readfile-via-safe-reader.script.spec.ts`
- **Gate**: type
- acceptance:
  - "≥5 tests verdes."

### S3 — Integración CI + docs

- **Status**: done
- **Files**: `package.json`, `bun run validate`, `docs/mcp-vertex/contributing/lint-rules.md`
- **Gate**: type
- acceptance:
  - "Script añadido a `bun run validate`."
  - "Documentación explica el lint."

## Acceptance

- **Unit**: `tools/scripts/lint/architecture-readfile-via-safe-reader.script.spec.ts` (≥5 tests).
- **E2E**: crear un plugin de prueba con el patrón vulnerable, ejecutar lint, esperar violación.
- **Regression**: tras `x00242`/`x00243`, el lint pasa verde sobre los plugins migrados.


- [ ] Lint `filesystem-reader-invariant` implementado en `tools/scripts/lint/filesystem-reader-invariant.script.ts`.
- [ ] Detecta: `import readFile from 'node:fs/promises'` y llamadas directas `readFile(...)` con path calculado.
- [ ] Allowlist por plugin con `allowReason` obligatorio.
- [ ] Tests del lint verdes (≥5).
- [ ] Plugins migrados (`context-for-change`, `impact-analysis`) pasan el lint sin allowlist.
- [ ] Añadido a `bun run validate`.
- [ ] Documentación: `docs/mcp-vertex/contributing/lint-rules.md` explica el lint, allowlist, y cómo añadir nuevos.
- [ ] `bun run validate` verde.


- Lint implementado y añadido a CI.
- Allowlist con reason obligatorio.
- Tests verdes.
- Plugins migrados pasan sin allowlist.

---

## Notes

- El lint **es** el regression guard. Cualquier intento futuro de reintroducir el patrón falla en CI.
- Allowlist requiere `allowReason` documentado; si no, falla.
- Revisión periódica: cada release revisa las allowlist activas y exige justificación.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/lint/filesystem-reader-invariant.script.ts
        - tools/scripts/lint/filesystem-reader-invariant.spec.ts
    - ci-integration: bun run lint:fs-invariant en bun run validate
    - docs: docs/mcp-vertex/contributing/lint-rules.md (sección filesystem-reader-invariant)
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track A.
- **Auditoría legada**: §5 FS2-003, §22 CORE2-001.
- **Predecesoras**: `x00241` (API), `x00242` (context-for-change), `x00243` (impact-analysis).
- **Cierra el Track A**: tras este lint, la invariante está blindada.
