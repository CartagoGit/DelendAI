---
id: f00175
title: "generators — registry, web catalog, docs y permission matrix generados desde manifests (MAN2-003..006)"
kind: feat
status: ready
type: proposal
track: manifests
date: 2026-08-25
priority: P2
classification: MEJORA / GENERATORS
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§11 MAN2-003/004/005/006 + §25 REG2-001/002/003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00174 # autodiscovery (predecesor)
    - i00008 # manifest vs package.json
    - i00009 # manifest vs preset catalog
---

# f00175 — generators: registry/web/docs/permissions

## Problem

Tras `f00174`, todos los plugins tienen manifest. Pero:

- `FIRST_PARTY_PLUGIN_INDEX` mezcla manual + generated.
- Web catalog mantiene listas propias.
- Docs de plugins pueden estar desactualizados.
- Permission matrix no está generada.

Reglas violadas: R3.2 (one source of truth), §11 MAN2-003..006.

## Evidence

```ts
// plugins/proposals/src/lib/first-party-plugin-index.ts (aprox)
export const FIRST_PARTY_PLUGIN_INDEX = [
  ...generatedEntries,
  ...manualEntries,  // ← fuente manual que debe eliminarse
];
```

Web catalog:

```ts
// apps/web/src/data/plugins/registry.ts
export const PLUGIN_REGISTRY = [
  // ...lista mantenida a mano
];
```

## Classification

`MEJORA / GENERATORS`.

## User impact

- Web/docs siempre frescos.
- Permission matrix siempre coherente.
- Menos duplicación manual.

## Privacy impact

Cero.

## Token impact

Cero (no afecta tools/list).

## Scope

**Permitido**:

- `tools/scripts/generate/first-party-plugin-index.script.ts` (genera el index).
- `tools/scripts/generate/web-catalog.script.ts` (genera `apps/web/src/data/plugins/catalog.generated.ts`).
- `tools/scripts/generate/plugin-docs.script.ts` (genera `docs/mcp-vertex/plugins/auto-generated/<id>.md`).
- `tools/scripts/generate/permission-matrix.script.ts` (genera tabla plugin × tool → permissions).
- CI integration.

**No permitido**:

- Cambios en manifests (cubierto por `f00174`).
- Cambios en plugins.

## Out of scope

- Migración de plugins a manifest (`f00174`).
- Validación manifest vs package.json (`i00008`).
- Validación manifest vs preset catalog (`i00009`).

## Design

### 1. FIRST_PARTY_PLUGIN_INDEX generado

```ts
// tools/scripts/generate/first-party-plugin-index.script.ts
import { loadAllPluginManifests } from '@mcp-vertex/core/manifest';
import { writeFileSync } from 'node:fs';

const manifests = await loadAllPluginManifests();

const entries = manifests.map((m) => ({
  id: m.id,
  package: m.package,
  version: m.version,
  visibility: m.visibility,
  summary: m.summary,
  tags: m.tags,
  maturity: m.maturity,
  presets: m.presets,
  permissions: m.permissions,
  toolPermissions: m.toolPermissions,
  tokenBudget: m.tokenBudget,
  capabilities: m.capabilities,
}));

const content = `// AUTO-GENERATED. DO NOT EDIT.
// Source: plugins/*/plugin.manifest.ts
// Regenerate: bun run generate:first-party-index

export const FIRST_PARTY_PLUGIN_INDEX = ${JSON.stringify(entries, null, 2)} as const;
`;

const outPath = 'plugins/proposals/src/lib/first-party-plugin-index.generated.ts';
writeFileSync(outPath, content,);
console.log(`Generated: ${outPath}`);
```

### 2. Web catalog generado

```ts
// tools/scripts/generate/web-catalog.script.ts
const webCatalog = manifests
  .filter((m) => m.visibility === 'public')
  .map((m) => ({
    id: m.id,
    name: prettyName(m.id),
    summary: m.summary,
    tags: m.tags,
    maturity: m.maturity,
    presets: m.presets,
    documentationUrl: `docs/mcp-vertex/plugins/auto-generated/${m.id}.md`,
  }));

const outPath = 'apps/web/src/data/plugins/catalog.generated.ts';
writeFileSync(outPath, `// AUTO-GENERATED. DO NOT EDIT.\n\nexport const WEB_PLUGIN_CATALOG = ${JSON.stringify(webCatalog, null, 2)} as const;\n`);
```

### 3. Plugin docs generadas

```md
<!-- tools/scripts/generate/plugin-docs.script.ts output: docs/mcp-vertex/plugins/auto-generated/<id>.md -->

---
id: <id>
package: <package>
version: <version>
maturity: <maturity>
generated: <timestamp>
---

# <Pretty Name>

> **Auto-generated**. Do not edit. Regenerate with `bun run generate:plugin-docs`.

## Summary

<summary>

## Tags

<tags>

## Permissions

<permissions>

## Tools

<tools with descriptions>

## Maturity

<maturity>

## Token budget

<tokenBudget>

## Dependencies

<dependencies>

## Capabilities

<capabilities>
```

### 4. Permission matrix

```ts
// tools/scripts/generate/permission-matrix.script.ts
const matrix: Record<string, Record<string, string[]>> = {};

for (const manifest of manifests) {
  matrix[manifest.id] = {};
  for (const tool of manifest.toolPermissions) {
    matrix[manifest.id][tool] = computeToolPermissions(manifest, tool);
  }
}

const md = generatePermissionMatrixMarkdown(matrix);
writeFileSync('docs/mcp-vertex/security/permission-matrix.md', md);
```

Markdown output:

```md
# Permission Matrix

| Plugin | Tool | Permissions |
|---|---|---|
| memory | memory_recall | filesystem-read |
| memory | memory_save | filesystem-read, filesystem-write |
| proposals | proposal_read | none |
| proposals | proposal_mutate | filesystem-read, filesystem-write |
...
```

### 5. CI integration

```yaml
# .github/workflows/ci.yml (extracto)
- name: Generate from manifests
  run: bun run generate:from-manifests
- name: Check generated artifacts
  run: bun run check:generated
```

`package.json`:

```json
{
  "scripts": {
    "generate:from-manifests": "bun run generate:first-party-index && bun run generate:web-catalog && bun run generate:plugin-docs && bun run generate:permission-matrix",
    "check:generated": "bun tools/scripts/lint/check-generated-artifacts.script.ts"
  }
}
```

Añadir a `bun run validate`.

## Tests

- **Unit**: cada generador produce output esperado.
- **Snapshot**: el output generado es byte-idéntico a la versión commiteada.
- **E2E**: cambiar un manifest sin regenerar los artifacts rompe CI.

## Acceptance criteria

- [ ] 4 generadores implementados.
- [ ] `bun run generate:from-manifests` ejecuta los 4.
- [ ] `bun run check:generated` detecta drift.
- [ ] CI falla si drift.
- [ ] Manual entries eliminadas de `FIRST_PARTY_PLUGIN_INDEX`.
- [ ] Web catalog regenerado.
- [ ] Plugin docs regeneradas (auto-generated).
- [ ] Permission matrix generada.
- [ ] `bun run validate` verde.

## Regression guards

- **CI check** verde.
- Si alguien edita un archivo `.generated.ts`, el CI falla con instrucción de regenerar.

## Resolution evidence (template)

```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/generate/first-party-plugin-index.script.ts
        - tools/scripts/generate/web-catalog.script.ts
        - tools/scripts/generate/plugin-docs.script.ts
        - tools/scripts/generate/permission-matrix.script.ts
        - tools/scripts/lint/check-generated-artifacts.script.ts
    - generated-files:
        - plugins/proposals/src/lib/first-party-plugin-index.generated.ts
        - apps/web/src/data/plugins/catalog.generated.ts
        - docs/mcp-vertex/plugins/auto-generated/*.md
        - docs/mcp-vertex/security/permission-matrix.md
    - before/after:
        before: "Manual entries mezcladas con generated"
        after:  "100% generated; manual entries eliminadas"
```

---

## Slices

- global_gate: type

### S1 — Generador FIRST_PARTY_PLUGIN_INDEX

- **Status**: pending
- **Files**: `tools/scripts/generate/first-party-plugin-index.script.ts`, output generado
- **Gate**: type
- acceptance:
  - "Index 100% generado."
  - "Manual entries eliminadas."

### S2 — Generador web catalog

- **Status**: pending
- **Files**: `tools/scripts/generate/web-catalog.script.ts`, output generado
- **Gate**: type
- acceptance:
  - "Web catalog 100% generado."

### S3 — Generador plugin docs + permission matrix

- **Status**: pending
- **Files**: `tools/scripts/generate/plugin-docs.script.ts`, `tools/scripts/generate/permission-matrix.script.ts`, outputs generados
- **Gate**: type
- acceptance:
  - "Docs generadas."
  - "Permission matrix generada."

### S4 — CI check

- **Status**: pending
- **Files**: `tools/scripts/lint/check-generated-artifacts.script.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "Check implementado."
  - "CI falla con drift."

## acceptance

- 4 generadores + CI check verdes.
- Manual entries eliminadas.

---

## Cómo se relaciona con el plan y la auditoría

- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track E.
- **Auditoría legada**: §11 MAN2-003..006, §25 REG2-001/002.
- **Predecesor**: `f00174` (autodiscovery).
- **Hermanas**: `i00008`, `i00009`.
- **Principio §41**: *"One source of truth for machine-readable metadata."*