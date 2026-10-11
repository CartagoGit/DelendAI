---
id: c00009
title: "lint — manifest vs preset catalog (compatibility matrix completa como gate CI) (MAN2-008)"
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
    section: "§11 MAN2-008"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00174 # autodiscovery
    - f00175 # generators
    - i00008 # manifest vs package.json
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# i00009 — lint: manifest vs preset catalog

## Goal

Hoy la matriz de compatibilidad entre plugins y presets es parcial. La auditoría §11 MAN2-008 pide que sea **gate completo**.

Una vez `f00174` migra todos los plugins a manifest (cada uno declara `presets: [...]`), un plugin puede declarar que está en un preset que no existe, o el preset puede no incluirlo cuando debería.

Reglas violadas: R3.2 (one source of truth), §11 MAN2-008.


```ts
// plugins/memory/plugin.manifest.ts
{
  "presets": ["lean", "standard", "swarm", "full", "vertex"]
  // ¿Existe el preset "lean"? ¿El plugin está realmente en "standard"?
}
```

Hoy no hay verificación sistemática.


`MEJORA / CI`.

## Why

Coherencia entre `manifest.presets` y la membership real de cada preset.


Cero.


Cero.

## Non-goals

**Permitido**:

- `tools/scripts/lint/manifest-vs-presets.script.ts` (nuevo).
- `tools/scripts/lint/manifest-vs-presets.spec.ts` (nuevo).
- `package.json` scripts.
- `.github/workflows/ci.yml`.

**No permitido**:

- Cambios en presets.
- Cambios en manifests.


- Manifest autodiscovery (`f00174`).
- Generadores (`f00175`).
- Manifest vs package.json (`i00008`).

## Architecture

### 1. Cargar presets y manifests

```ts
// tools/scripts/lint/manifest-vs-presets.script.ts
import { glob } from 'tinyglobby';
import * as path from 'node:path';
import { validatePluginManifest, loadAllPluginManifests } from '@mcp-vertex/core/manifest';
import { PRESET_DEFINITIONS } from '@mcp-vertex/core/presets';

interface Violation {
  plugin: string;
  rule: string;
  message: string;
}

const violations: Violation[] = [];

const manifests = await loadAllPluginManifests();
const knownPresetNames = Object.keys(PRESET_DEFINITIONS);

// Construir mapa: preset → plugins (desde PRESET_DEFINITIONS).
const presetMembership: Record<string, Set<string>> = {};
for (const [presetName, preset] of Object.entries(PRESET_DEFINITIONS)) {
  presetMembership[presetName] = new Set(preset.plugins);
}

for (const manifest of manifests) {
  // Regla 1: cada preset declarado en manifest.presets existe.
  for (const preset of manifest.presets) {
    if (!knownPresetNames.includes(preset)) {
      violations.push({
        plugin: manifest.id,
        rule: 'MANIFEST-PRESET-001',
        message: `manifest.presets contains "${preset}" which is not a known preset.`,
      });
    }
  }

  // Regla 2: el plugin está realmente en cada preset que declara.
  for (const preset of manifest.presets) {
    if (!presetMembership[preset]?.has(manifest.id)) {
      violations.push({
        plugin: manifest.id,
        rule: 'MANIFEST-PRESET-002',
        message: `manifest.presets includes "${preset}" but plugin "${manifest.id}" is not in PRESET_DEFINITIONS.${preset}.plugins.`,
      });
    }
  }

  // Regla 3 (opcional): el plugin está en cada preset que PRESET_DEFINITIONS lo lista.
  for (const [presetName, members] of Object.entries(presetMembership)) {
    if (members.has(manifest.id) && !manifest.presets.includes(presetName)) {
      violations.push({
        plugin: manifest.id,
        rule: 'MANIFEST-PRESET-003',
        message: `PRESET_DEFINITIONS.${presetName}.plugins includes "${manifest.id}" but manifest.presets does not.`,
      });
    }
  }
}

if (violations.length > 0) {
  console.error('[manifest-vs-presets] Violations found:');
  for (const v of violations) {
    console.error(`  ${v.plugin}: [${v.rule}] ${v.message}`);
  }
  process.exit(1);
}

console.log('[manifest-vs-presets] OK.');
```

### 2. Tests

```ts
// tools/scripts/lint/manifest-vs-presets.spec.ts
describe('manifest-vs-presets lint', () => {
  it('flags unknown preset in manifest.presets', async () => {
    // manifest.presets: ["unknown-preset"]
  });

  it('flags preset in manifest.presets but not in PRESET_DEFINITIONS', async () => {
    // manifest.presets: ["lean"] pero PRESET_DEFINITIONS.lean.plugins no incluye el id
  });

  it('flags preset in PRESET_DEFINITIONS but not in manifest.presets', async () => {
    // inverso del anterior
  });

  it('passes for coherent manifest + presets', async () => {
    // ambos coherentes
  });
});
```

### 3. CI

```yaml
# .github/workflows/ci.yml (extracto)
- name: Manifest vs preset catalog lint
  run: bun run lint:manifest-vs-presets
```

```json
// package.json
{
  "scripts": {
    "lint:manifest-vs-presets": "bun tools/scripts/lint/manifest-vs-presets.script.ts"
  }
}
```

Añadir a `bun run validate`.

## Slices

- global_gate: type

### S1 — Lint + tests + CI

- **Status**: done
- **Files**: `tools/scripts/lint/manifest-vs-presets.script.ts`, `tools/scripts/lint/manifest-vs-presets.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "Lint detecta 3 tipos de drift."
  - "Tests verdes."
  - "CI falla con drift."

## Acceptance

- **Unit**: ≥4 tests del lint (preset inexistente, preset en manifest sin membership, membership sin preset en manifest, happy path).
- **E2E**: drift rompe CI.


- [ ] Lint implementado.
- [ ] Tests verdes.
- [ ] Integrado en CI y `bun run validate`.
- [ ] Documentación: `docs/mcp-vertex/contributing/lint-rules.md` explica el lint.
- [ ] `bun run validate` verde.


- Lint detecta drift entre manifest y preset catalog.
- Tests verdes.
- CI integrado.

---

## Notes

- El lint es el regression guard.
- Cualquier drift futuro entre manifest.presets y PRESET_DEFINITIONS rompe CI.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/lint/manifest-vs-presets.script.ts
        - tools/scripts/lint/manifest-vs-presets.spec.ts
    - ci-integration: bun run lint:manifest-vs-presets en CI
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track E.
- **Auditoría legada**: §11 MAN2-008.
- **Predecesores**: `f00174` (autodiscovery), `f00175` (generators).
- **Hermana**: `i00008` (package.json).
- **Principio §41**: *"One source of truth for machine-readable metadata."*
