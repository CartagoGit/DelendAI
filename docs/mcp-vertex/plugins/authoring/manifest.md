# Plugin Manifest Authoring

`plugin.manifest.ts` is the single source of truth for first-party plugin metadata.

## Required file

Every public plugin under `plugins/<id>/` must ship:

```ts
import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: '<plugin-id>',
	package: '@delendai/<plugin-id>',
	version: '0.1.1',
	visibility: 'public',
	summary: 'One-line operational summary.',
	tags: ['search', 'docs'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['search', 'docs'],
});
```

Private/internal plugins use the same schema with `visibility: 'private'`.

## Source of truth rules

- `id` must match the plugin folder name.
- `package` must match `package.json#name`.
- `version` must match `package.json#version`.
- `visibility` must match the package publish policy.
- `presets` must match real membership in `PRESET_CATALOG`.

## Generated consumers

These artifacts are generated from manifests:

- `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
- `apps/web/src/generated/plugin-manifest-catalog.generated.ts`
- `apps/web/src/data/plugins/catalog.generated.ts`
- `docs/mcp-vertex/generated/plugin-manifests.generated.md`
- `docs/mcp-vertex/generated/plugin-manifests.generated.json`
- `docs/mcp-vertex/plugins/auto-generated/*.md`
- `docs/mcp-vertex/security/permission-matrix.md`

## Commands

- Regenerate artifacts: `bun run ./tools/scripts/generate/from-manifests.script.ts`
- Check generated drift: `bun run ./tools/scripts/generate/from-manifests.script.ts --check`
- Lint package coherence: `bun run ./tools/scripts/lint/manifest-vs-package.script.ts`
- Lint preset coherence: `bun run ./tools/scripts/lint/manifest-vs-presets.script.ts`
- Lint manifest presence: `bun run ./tools/scripts/lint/plugin-manifest.script.ts`

## Migration notes

- Do not add metadata directly to the first-party registry or the web catalog.
- Add or update `plugin.manifest.ts`, then regenerate derived artifacts.
- If a plugin changes preset membership, update `PRESET_CATALOG` and the manifest in the same slice.