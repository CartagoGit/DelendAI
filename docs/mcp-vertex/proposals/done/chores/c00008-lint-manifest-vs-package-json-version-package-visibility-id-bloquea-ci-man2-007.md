---
id: c00008
title: "lint — manifest vs package.json (version, package, visibility, id) — bloquea CI (MAN2-007)"
kind: chore
status: done
type: proposal
track: manifests
date: 2026-08-25
priority: P2
classification: MEJORA / CI
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§11 MAN2-007"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00174 # autodiscovery (predecesor)
    - f00175 # generators
    - i00009 # manifest vs preset catalog
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# i00008 — lint: manifest vs package.json

## Goal

Una vez `f00174` migra todos los plugins a manifest, hay riesgo de drift entre:

- `plugins/<id>/plugin.manifest.ts#version`
- `plugins/<id>/package.json#version`

- `plugins/<id>/plugin.manifest.ts#package`
- `plugins/<id>/package.json#name`

- `plugins/<id>/plugin.manifest.ts#id`
- Carpeta padre `<id>`

- `plugins/<id>/plugin.manifest.ts#visibility`
- Política de la organización (público vs privado)

Reglas violadas: R3.2 (one source of truth), §11 MAN2-007.


No existe lint que verifique coherencia. Un plugin puede tener `manifest.version = 1.4.2` pero `package.json#version = 1.4.3` y nadie lo detecta.


`MEJORA / CI`.

## Why

Detección temprana de inconsistencias.


Cero.


Cero.

## Non-goals

**Permitido**:

- `tools/scripts/lint/manifest-vs-package.script.ts` (nuevo).
- `tools/scripts/lint/manifest-vs-package.spec.ts` (nuevo).
- `package.json` scripts.
- `.github/workflows/ci.yml`.

**No permitido**:

- Cambios en plugins.
- Cambios en manifests.


- Manifest autodiscovery (`f00174`).
- Generadores (`f00175`).
- Manifest vs preset catalog (`i00009`).

## Architecture

### 1. Lint

```ts
// tools/scripts/lint/manifest-vs-package.script.ts
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'tinyglobby';
import { validatePluginManifest } from '@mcp-vertex/core/manifest';

interface Violation {
  plugin: string;
  rule: string;
  message: string;
}

const violations: Violation[] = [];
const pluginPaths = await glob('plugins/*/plugin.manifest.ts');

for (const manifestPath of pluginPaths) {
  const pluginDir = path.dirname(manifestPath);
  const pluginId = path.basename(pluginDir);

  // Cargar manifest.
  const manifestModule = await import(path.resolve(manifestPath));
  const manifest = validatePluginManifest(manifestModule.default);

  // Cargar package.json.
  const packageJsonPath = path.join(pluginDir, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  // Regla 1: id coincide con la carpeta.
  if (manifest.id !== pluginId) {
    violations.push({
      plugin: pluginId,
      rule: 'MANIFEST-ID-001',
      message: `manifest.id "${manifest.id}" does not match folder "${pluginId}".`,
    });
  }

  // Regla 2: package coincide con package.json#name.
  if (manifest.package !== packageJson.name) {
    violations.push({
      plugin: pluginId,
      rule: 'MANIFEST-PKG-001',
      message: `manifest.package "${manifest.package}" does not match package.json#name "${packageJson.name}".`,
    });
  }

  // Regla 3: version coincide con package.json#version.
  if (manifest.version !== packageJson.version) {
    violations.push({
      plugin: pluginId,
      rule: 'MANIFEST-VER-001',
      message: `manifest.version "${manifest.version}" does not match package.json#version "${packageJson.version}".`,
    });
  }

  // Regla 4: visibility es coherente.
  // - Si el package es @mcp-vertex/* → visibility debe ser 'public' (excepto allowlist)
  // - Si visibility es 'private' pero el package es público → violación.
  const isPublicPackage = manifest.package.startsWith('@mcp-vertex/');
  if (manifest.visibility === 'private' && isPublicPackage) {
    violations.push({
      plugin: pluginId,
      rule: 'MANIFEST-VIS-001',
      message: `manifest.visibility is "private" but package "${manifest.package}" is in @mcp-vertex/* scope.`,
    });
  }
}

if (violations.length > 0) {
  console.error('[manifest-vs-package] Violations found:');
  for (const v of violations) {
    console.error(`  ${v.plugin}: [${v.rule}] ${v.message}`);
  }
  process.exit(1);
}

console.log('[manifest-vs-package] OK.');
```

### 2. Tests

```ts
// tools/scripts/lint/manifest-vs-package.spec.ts
describe('manifest-vs-package lint', () => {
  it('flags id mismatch', async () => {
    // crear plugin/ con carpeta "foo" y manifest.id "bar"
  });

  it('flags package mismatch', async () => {
    // manifest.package "@mcp-vertex/foo", package.json#name "@mcp-vertex/bar"
  });

  it('flags version mismatch', async () => {
    // manifest.version "1.0.0", package.json#version "1.0.1"
  });

  it('flags private visibility with public package', async () => {
    // manifest.visibility "private" + package "@mcp-vertex/foo"
  });

  it('passes for consistent manifest + package.json', async () => {
    // ambos coherentes
  });
});
```

### 3. CI

```yaml
# .github/workflows/ci.yml (extracto)
- name: Manifest vs package.json lint
  run: bun run lint:manifest-vs-package
```

```json
// package.json
{
  "scripts": {
    "lint:manifest-vs-package": "bun tools/scripts/lint/manifest-vs-package.script.ts"
  }
}
```

Añadir a `bun run validate`.

## Slices

- global_gate: type

### S1 — Lint + tests + CI

- **Status**: done
- **Files**: `tools/scripts/lint/manifest-vs-package.script.ts`, `tools/scripts/lint/manifest-vs-package.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "Lint detecta 4 tipos de drift."
  - "Tests verdes."
  - "CI falla con drift."

## Acceptance

- **Unit**: ≥5 tests del lint (id, package, version, visibility, happy path).
- **E2E**: un plugin con drift rompe CI.


- [ ] Lint implementado.
- [ ] Tests verdes.
- [ ] Integrado en CI y `bun run validate`.
- [ ] Documentación: `docs/mcp-vertex/contributing/lint-rules.md` explica el lint.
- [ ] `bun run validate` verde.


- Lint detecta id/package/version/visibility drift.
- Tests verdes.
- CI integrado.

---

## Notes

- El lint es el regression guard.
- Cualquier drift futuro entre manifest y package.json rompe CI.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/lint/manifest-vs-package.script.ts
        - tools/scripts/lint/manifest-vs-package.spec.ts
    - ci-integration: bun run lint:manifest-vs-package en CI
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track E.
- **Auditoría legada**: §11 MAN2-007.
- **Predecesor**: `f00174` (autodiscovery).
- **Hermana**: `i00009` (preset catalog).
- **Principio §41**: *"One source of truth for machine-readable metadata."*
