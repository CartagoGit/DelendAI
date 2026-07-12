---
id: f00109
title: "Dead-config diagnostics: warn when docsDir or configured roots do not exist"
kind: feat
status: review
type: proposal
track: general
date: 2026-07-12
---

# f00109 — Dead-config diagnostics: warn when docsDir or configured roots do not exist

## Goal

At boot, `assembleCliConfig` must detect (a) a resolved `docsDir` that does not
exist in the workspace and (b) any plugin `options.roots` entry that does not
exist, surface those as config issues in the `--check` doctor output, the boot
stderr log AND a new overview `configIssues` field, and switch
`recommendedNextAction` to a fix-the-config instruction when `docsDir` is
missing.

## why

A consumer project that copies `mcp-vertex.config.json` from another repo
(wrong `docsDir`, roots pointing at folders that do not exist) currently boots
silently: every plugin scans empty directories, `overview` still recommends
`proposals_auto_work`, and the agent never learns the designated workflow.
Observed in the `porra` project: config copied from this monorepo
(`packages/`, `plugins/`, `docs/mcp-vertex/`) onto an Angular+Python repo —
the agent hand-created its own proposals scheme because the server never told
it anything was wrong.

## non-goals

- Blocking boot on a dead config (a fresh project pre-scaffold is legal).
- Validating plugin options beyond the shared `options.roots` convention.
- Auto-fixing or scaffolding the missing layout (that stays in
  `mcp-vertex init` / `scaffold`).

## Slices

- global_gate: e2e

### S1 — Boot-time workspace-layout diagnostics + overview surfacing
- **Status**: in-progress
- **Files**: [packages/core/src/lib/plugins/diagnose-workspace-layout.ts, packages/core/tests/src/lib/plugins/diagnose-workspace-layout.spec.ts, packages/core/src/lib/cli/assemble.ts, packages/core/src/lib/tools/overview-tool.ts, packages/core/src/public/index.ts]
- **Gate**: bun run validate
- status: done
## acceptance

- Pure `diagnoseWorkspaceLayout({ config, configPresent, docsDir, probe })`
  returns human-readable issues for a missing `docsDir` and each missing
  `options.roots` entry; silent when no config file is present.
- `assembleCliConfig` merges the issues into the `--check` doctor config
  diagnostic, prints them to stderr at normal boot, and exposes them on the
  overview snapshot as `configIssues` (omitted when empty, present in both
  compact and full modes).
- `recommendedNextAction` switches to a fix-the-config instruction when
  `docsDir` is missing instead of routing to `proposals_auto_work`.
- `bun run validate` green.
