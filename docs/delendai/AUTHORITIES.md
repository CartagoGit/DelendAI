# Authorities — generated

<!-- generated: tools/scripts/gen/authorities.script.ts -->
<!-- generated — do not edit by hand -->

For every fact kept in more than one place: the copy that is the truth, the copies derived from it, what writes each copy, and what notices when they drift. Edit the authority, never a projection; declare a new fact in `tools/scripts/gen/repo-authorities.constant.ts` (this repository) or in a plugin manifest’s `authorities` (a product fact), then regenerate with `bun run gen:all`.

## agent-catalog

- **Authority**: `docs/delendai/proposals`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `catalog:check`

| Projection | Producer |
| --- | --- |
| `docs/delendai/agent-catalog.generated.json` | `tools/scripts/catalog/generate-agent-catalog.script.ts` |
| `docs/delendai/host-hints/agent-instructions.generated.md` | `tools/scripts/catalog/render-host-hints.script.ts` |

## bundled-skills

- **Authority**: `packages/core/skills/manifest.json`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `gen:all:check`

| Projection | Producer |
| --- | --- |
| `packages/cli/src/lib/init/init-skill-inventory.generated.ts` | `tools/scripts/gen/init-skill-inventory.script.ts` |

## catalog-wire-cost

- **Authority**: `measurement:tools/list`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `tokens:dashboard:check`

| Projection | Producer |
| --- | --- |
| `docs/delendai/TOKEN-BUDGETS.md` | `tools/scripts/report/token-budget-dashboard.script.ts` |
| `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts` | `tools/scripts/generate/preset-metadata.script.ts` |

## config-schema

- **Authority**: `packages/core/src/lib/plugins/config-file-schema.ts`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `gen:all:check`

| Projection | Producer |
| --- | --- |
| `packages/core/schema/delendai.config.schema.json` | `tools/scripts/types/generate-config-schema.script.ts` |

## observability-provenance

- **Authority**: `plugins/observability/plugin.manifest.ts`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `gen:all:check`

| Projection | Producer |
| --- | --- |
| `docs/delendai/generated/observability-provenance.generated.md` | `tools/scripts/gen/provenance-truth.script.ts` |

## plugin-manifests

- **Authority**: `plugins/*/plugin.manifest.ts`
- **Declared by**: this repository
- **Rebuild**: `bun run gen:all`
- **Drift gate**: `gen:all:check`

| Projection | Producer |
| --- | --- |
| `docs/delendai/generated/plugin-manifests.generated.json` | `tools/scripts/generate/from-manifests.script.ts` |
| `docs/delendai/generated/plugin-manifests.generated.md` | `tools/scripts/generate/from-manifests.script.ts` |
| `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts` | `tools/scripts/generate/from-manifests.script.ts` |
| `apps/web/src/generated/plugin-manifest-catalog.generated.ts` | `tools/scripts/generate/from-manifests.script.ts` |
| `apps/web/src/data/plugins/catalog.generated.ts` | `tools/scripts/generate/from-manifests.script.ts` |
| `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts` | `tools/scripts/generate/managed-lazy-catalog.script.ts` |
| `docs/delendai/generated/plugin-catalog.generated.md` | `tools/scripts/docs/generate-catalog.script.ts` |

## proposal-status

- **Authority**: `docs/delendai/proposals`
- **Declared by**: plugin `proposals`
- **Rebuild**: `the sync_proposals tool of this plugin`
- **Drift gate**: —
- **Reconciler**: `plugins/proposals/src/lib/services/projection-refresh.ts`
- **Digest**: `plugins/proposals/src/lib/proposals/index-reader-parity.ts`

| Projection | Producer |
| --- | --- |
| `.cache/delendai/proposals/index.json` | `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` |
| `.cache/delendai/state/proposals.sqlite` | `plugins/proposals/src/lib/services/projection-refresh.ts` |
