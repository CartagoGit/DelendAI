---
id: x00763
title: "No live name keeps the old brand"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-29
priority: P1
related: [x00758]
---

# x00763 — No live name keeps the old brand

## goal

No live identifier in this repository keeps the previous product name in
any spelling, and a project migrated from it gets every spelling renamed.

## why

The commit hook that neutralises credential-shaped strings writes
`MCPV_REDACTED_SECRET_<KIND>`: the abbreviation of the old name, still
live after the rename. So did the extension's configuration-host global
(`__MCPV_CONFIGURATION_HOST__`), the dashboard's detail global and a
style-lint sentinel. Nothing reported them, for two reasons:

- The catalog of old spellings (`LEGACY_IDENTITY_SPELLINGS`), which the
  residual scanner and the rebrand check use, is matched case-sensitively
  and held only `mcpv` in lower case: `MCPV`, `Mcpv`, `McpVertex`,
  `mcpVertex` and `MCPVERTEX` were never looked for.
- The rebrand check skipped all of `tools/scripts/lint/` and
  `tools/scripts/git/` as "historical", so the hook's placeholder, in a
  lint script, was out of sight even for the spellings it knew.

The migrator that renames a consumer project's configuration uses the
rename table next to that catalog, so it had the same gap.

## why this design

- The spellings go into the one catalog and the one rename table, so the
  scanner, the rebrand check and the consumer migrator agree on them.
  Longest and most specific first, as before, so `McpVertex` becomes
  `Delendai` (`IMcpVertexHostConfig` → `IDelendaiHostConfig`) and
  `__MCPV_…__` becomes `__DELENDAI_…__`.
- The live names are renamed: `__DELENDAI_CONFIGURATION_HOST__`,
  `__DELENDAI_DASHBOARD_DETAIL__`, `__DELENDAI_GLOBSTAR_SENTINEL__` and
  the placeholder `DELENDAI_REDACTED_SECRET_<KIND>`.
- The rebrand check no longer skips whole directories of tools: only the
  two files that must spell the old completion name to flag it
  (`i18n-english-prose` and its spec) are listed as intentional legacy.

## non-goals

- Rewriting history: proposals, the changelog, the brand contract and the
  migration guide name the old brand on purpose.

## Slices

- global_gate: none

### S1 — Every spelling of the old name is known, and none is live

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/workspace-migration && bun run migrate:rebrand:check`
- **Files**:
  - `packages/core/src/lib/contracts/constants/legacy-identity.constant.ts`
  - `packages/core/src/lib/workspace-migration/migrators/identity-renames.ts`
  - `packages/core/tests/src/lib/workspace-migration/classify-residual.service.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/migrators/identity-renames.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/scanner/legacy-identity-scanner.spec.ts`
  - `tools/scripts/migrate/rebrand-propagate.script.ts`
  - `tools/scripts/lint/no-secrets.script.ts`
  - `tools/scripts/lint/no-secrets.script.spec.ts`
  - `tools/scripts/lint/style-integrity.script.ts`
  - `extensions/vscode/src/commands/open-configuration-center.ts`
  - `extensions/vscode/src/commands/open-plugin-config.ts`
  - `extensions/vscode/src/dev/pages/configuration-center.ts`
  - `extensions/vscode/src/test/configuration-center.spec.ts`
  - `packages/ui-extension/src/configuration-center/configuration-center-script.ts`
  - `packages/ui-extension/src/dashboard/render-dashboard.ts`

## dependency graph

None.

## acceptance

- `bun run migrate:rebrand:check` reports 0 live hits with `tools/scripts/`
  scanned.
- The consumer migrator renames `__MCPV_…__`, `IMcpVertex…`,
  `mcpVertex…` and `MCPV_REDACTED_SECRET_…` to their new spellings.
- The one consumer project running delendai here (pantallas-azur) has no
  live remnant of the old name (checked 2026-09-29: none, tracked or in
  its local MCP configuration).
