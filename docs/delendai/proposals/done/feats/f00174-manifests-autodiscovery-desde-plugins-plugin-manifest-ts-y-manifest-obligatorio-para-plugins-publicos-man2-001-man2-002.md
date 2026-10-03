---
id: f00174
title: "manifests — autodiscovery desde plugins/*/plugin.manifest.ts y manifest obligatorio para plugins públicos (MAN2-001 + MAN2-002)"
kind: feat
status: done
type: proposal
track: manifests
date: 2026-08-25
priority: P2
classification: CONFIRMADO / ARQUITECTURA PARCIAL
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§11 MAN2-001 + MAN2-002 + §25 REG2-001/003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00175 # generated registry/docs/web/permissions (consumidor)
    - i00008 # manifest vs package.json (consumidor)
    - i00009 # manifest vs preset catalog (consumidor)
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# f00174 — manifests: autodiscovery + manifest obligatorio

## Goal

Hoy solo 6 plugins tienen `plugin.manifest.ts`:

```text
adaptive-optimizer
context-for-change
impact-analysis
project-health
quality-policy
search
```

El resto (~43 plugins) sigue registrado manualmente. El sistema actual declara:

```ts
const MIGRATED_PLUGIN_IDS = ['adaptive-optimizer', ...];
```

Esto es una **lista manual de plugins migrados** — exactamente lo opuesto a "single source of truth".

Reglas violadas: R3.2 (one source of truth), §11 MAN2-001.


```ts
// plugins/proposals/src/lib/manifest-migrated-ids.ts (aprox)
export const MIGRATED_PLUGIN_IDS = [
  'adaptive-optimizer',
  'context-for-change',
  'impact-analysis',
  'project-health',
  'quality-policy',
  'search',
];
```

El sistema descubre estos 6 automáticamente; el resto requiere registration manual.


`CONFIRMADO / ARQUITECTURA PARCIAL`.

## Why

- Nuevo plugin: si tiene manifest, se descubre automáticamente.
- Web/docs/registry: coherentes con HEAD.
- Mantenedores: menos duplicación.


Cero.


Cero (no cambia surface directamente).

## Non-goals

**Permitido**:

- `packages/core/src/lib/manifest/discovery.ts` (nuevo: descubre manifests).
- `packages/core/src/lib/manifest/validation.ts` (nuevo: valida manifests).
- `plugins/*/plugin.manifest.ts` (migrar los 43 plugins restantes).
- `FIRST_PARTY_PLUGIN_INDEX` regenerado.
- CI workflow.

**No permitido**:

- Cambios en plugins existentes que ya tienen manifest.
- Cambios en la lógica de manifests en sí (esquema definido en otros lugares).


- Generador de registry/web/docs/permissions (`f00175`).
- Validación manifest vs package.json (`i00008`).
- Validación manifest vs preset catalog (`i00009`).

## Architecture

### 1. Discovery

```ts
// packages/core/src/lib/manifest/discovery.ts
import { glob } from 'tinyglobby';
import * as path from 'node:path';

export async function discoverPluginManifests(rootDir: string = process.cwd()): Promise<string[]> {
  return glob('plugins/*/plugin.manifest.ts', {
    cwd: rootDir,
    absolute: true,
  });
}

export async function loadAllPluginManifests(rootDir?: string): Promise<IPluginManifest[]> {
  const paths = await discoverPluginManifests(rootDir);
  const manifests: IPluginManifest[] = [];

  for (const manifestPath of paths) {
    const manifestModule = await import(manifestPath);
    manifests.push(manifestModule.default);
  }

  return manifests;
}
```

### 2. Validación

```ts
// packages/core/src/lib/manifest/validation.ts
import { z } from 'zod';

const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  package: z.string().regex(/^@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
  visibility: z.enum(['public', 'private']),
  summary: z.string().min(20).max(280),
  tags: z.array(z.string()),
  maturity: z.enum(['experimental', 'beta', 'stable', 'deprecated']),
  permissions: z.array(z.string()),
  toolPermissions: z.array(z.string()),
  presets: z.array(z.string()),
  tokenBudget: z.object({
    toolsListBytes: z.number().int().nonnegative(),
    schemaBytes: z.number().int().nonnegative(),
  }),
  dependencies: z.array(z.string()),
  capabilities: z.array(z.string()),
});

export type IPluginManifest = z.infer<typeof pluginManifestSchema>;

export function validatePluginManifest(manifest: unknown): IPluginManifest {
  return pluginManifestSchema.parse(manifest);
}
```

### 3. Esquema de manifest (canónico)

```ts
// plugins/<plugin-id>/plugin.manifest.ts (ejemplo para memory)
import { definePluginManifest } from '@mcp-vertex/core/manifest';

export default definePluginManifest({
  id: 'memory',
  package: '@mcp-vertex/memory',
  version: '1.4.2',
  visibility: 'public',
  summary: 'Persistent agent memory with BM25 recall, TTL, compaction, event-driven freshness.',
  tags: ['memory', 'recall', 'compaction'],
  maturity: 'stable',
  permissions: ['filesystem-read', 'filesystem-write'],
  toolPermissions: [
    'memory_recall',
    'memory_save',
    'memory_forget',
    'memory_compact',
    'memory_recall_list',
  ],
  presets: ['lean', 'standard', 'swarm', 'full', 'vertex'],
  tokenBudget: {
    toolsListBytes: 12_400,
    schemaBytes: 8_200,
  },
  dependencies: [],
  capabilities: ['memory-recall', 'memory-compaction'],
});
```

### 4. Migración de los 43 plugins restantes

Tarea sistemática:

1. Para cada `plugins/*/src/index.ts`, leer package metadata + tools.
2. Generar `plugin.manifest.ts` con los campos derivados.
3. Validar con `validatePluginManifest`.
4. Commitear.
5. Regenerar `FIRST_PARTY_PLUGIN_INDEX`.

Cada migración es un slice individual dentro de esta propuesta (slices S2.x).

### 5. Eliminación de `MIGRATED_PLUGIN_IDS`

```diff
- // plugins/proposals/src/lib/manifest-migrated-ids.ts
- export const MIGRATED_PLUGIN_IDS = [
-   'adaptive-optimizer',
-   'context-for-change',
-   'impact-analysis',
-   'project-health',
-   'quality-policy',
-   'search',
- ];
```

El sistema definitivo no tiene esta lista. El registry se carga completamente desde manifests.

### 6. Plugin visibility

Plugins privados internos usan el mismo schema con `visibility: 'private'`. No se exponen en web catalog ni en registry público.

## Slices

- global_gate: type

### S1 — Discovery + Validation

- **Status**: done
- **Files**: `packages/core/src/lib/manifest/discovery.ts`, `packages/core/src/lib/manifest/validation.ts`
- **Gate**: type
- acceptance:
  - "`loadAllPluginManifests` exportado."
  - "`validatePluginManifest` rechaza manifests inválidos con errores tipados."

### S2 — Migración de los 43 plugins restantes

- **Status**: done
- **Files**: `plugins/*/plugin.manifest.ts` (43 archivos nuevos)
- **Gate**: type
- acceptance:
  - "Cada plugin público tiene manifest."
  - "Cada manifest valida con `validatePluginManifest`."
  - "FIRST_PARTY_PLUGIN_INDEX regenerado."

### S3 — Eliminación de `MIGRATED_PLUGIN_IDS`

- **Status**: done
- **Files**: `packages/core/src/lib/registry/first-party-index.ts`, `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
- **Gate**: type
- acceptance:
  - "Lista eliminada."
  - "Registry se carga desde manifests."

### S4 — Lint + documentación

- **Status**: done
- **Files**: `tools/scripts/lint/plugin-manifest.script.ts`, `docs/mcp-vertex/plugins/authoring/manifest.md`
- **Gate**: type
- acceptance:
  - "Lint falla si un plugin público no tiene manifest."
  - "Documentación explica esquema y migración."

## Acceptance

- **Unit**: `validatePluginManifest` con manifests válidos e inválidos.
- **Integration**: `discoverPluginManifests` encuentra todos los manifests.
- **Migration tests**: cada plugin migrado carga su manifest correctamente.
- **CI**: el conteo de plugins con manifest == el conteo de plugins registrados.


- [ ] `definePluginManifest` + `validatePluginManifest` exportados desde `@mcp-vertex/core/manifest`.
- [ ] `loadAllPluginManifests` descubre todos los manifests.
- [ ] Los 43 plugins restantes tienen `plugin.manifest.ts`.
- [ ] `MIGRATED_PLUGIN_IDS` eliminado del código.
- [ ] `FIRST_PARTY_PLUGIN_INDEX` generado desde manifests.
- [ ] Lint CI: cada plugin público con manifest.
- [ ] Documentación: `docs/mcp-vertex/plugins/authoring/manifest.md` explica el esquema y la migración.
- [ ] `bun run validate` verde.


- 43 plugins migrados.
- `MIGRATED_PLUGIN_IDS` eliminado.
- Lint y gate verde.

---

## Notes

- **Lint arquitectónico** (`i00008`): valida manifest vs package.json.
- **CI gate**: el conteo de manifests debe coincidir con plugins registrados.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - packages/core/src/lib/manifest/discovery.ts
        - packages/core/src/lib/manifest/validation.ts
        - plugins/*/plugin.manifest.ts (43 plugins migrados)
    - removed-files:
        - plugins/proposals/src/lib/manifest-migrated-ids.ts
    - first-party-index: regenerated
    - tests: discovery + validation + migration verdes
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track E.
- **Auditoría legada**: §11 MAN2-001 + MAN2-002.
- **Hermanas**: `f00175` (generadores), `i00008` (package.json check), `i00009` (preset catalog).
- **Principio §41**: *"One source of truth for machine-readable metadata."*
