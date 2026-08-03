---
id: x00192
title: "packages/cli missing @mcp-vertex/auto-agent-selector dependency — breaks the dist build in every CI run"
kind: fix
status: done
type: proposal
track: ci+audit-followup
date: 2026-07-30
shipped-in:
    - 9efce103 # fix(x00192): packages/cli was missing its @mcp-vertex/auto-agent-selector dependency
---

# x00192 — packages/cli missing @mcp-vertex/auto-agent-selector dependency — breaks the dist build in every CI run

## Goal

Fix a real, currently-reproducing CI break discovered while checking the mergeability of the 11 PRs open this session: EVERY open PR's CI fails identically (pack smoke, metrics longitudinal regression gate, typecheck+tests, web site build all red) at the exact same step — `packages/cli`'s dist build fails with `TS2307: Cannot find module '@mcp-vertex/auto-agent-selector/public'` in `src/commands/groups/router-dashboard.ts`. Root cause: `packages/cli/package.json` never declares `@mcp-vertex/auto-agent-selector` as a dependency even though `router-dashboard.ts` (statically imported into the CLI's always-registered command registry, not lazily loaded) imports from it directly. `tools/scripts/compile/build.script.ts` derives each package's cross-workspace tsconfig `paths` strictly from that package's own declared `dependencies`/`peerDependencies` — since the dependency was never declared, the path mapping is silently omitted from the generated build-time tsconfig, and a clean CI install has no other way to resolve the import. It happened to keep working in long-lived local dev environments (residual node_modules symlinks from many prior installs across an unrelated, very long session) which is exactly why it went undetected until checked against real CI logs.

## why

This single missing dependency declaration is the root cause of ALL CI failures on ALL 11 currently-open PRs (#16-#26) — verified by pulling the actual failing-job logs for 2 different PRs (one from ~13 hours ago, one from ~1 hour ago) and confirming byte-identical failures at the identical build step. Fixing it unblocks every other PR's CI once each is rebased onto/merged with develop.

## non-goals

- Auditing every other workspace package for the same class of missing-dependency gap (only packages/cli was proven broken against real CI logs this round; a broader scanner is a separate, larger proposal if the user wants one)
- Adding a new lint rule that would have caught this. The fix here is the missing dependency declaration itself; a prevention-gate is worth proposing separately but is out of scope for restoring CI to green right now.

## Slices

- global_gate: none

### S1 — Add the missing workspace dependency + regenerate the lockfile
- **Status**: done
- **Files**: `packages/cli/package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "`packages/cli/package.json`'s `dependencies` includes `"@mcp-vertex/auto-agent-selector": "workspace:*"`"
  - "`bun install` regenerates `bun.lock` cleanly with no other changes"
  - "`bun run build` (all 45 packages) and `bun run typecheck` both exit 0 from a fresh `rm -rf packages/cli/dist packages/cli/node_modules/.cache/mcp-vertex-dts` + rebuild"

## acceptance

- `packages/cli/package.json`'s `dependencies` includes `"@mcp-vertex/auto-agent-selector": "workspace:*"`
- `bun install` regenerates `bun.lock` cleanly with no other changes
- `bun run build` (all 45 packages) and `bun run typecheck` both exit 0 from a fresh `rm -rf packages/cli/dist packages/cli/node_modules/.cache/mcp-vertex-dts` + rebuild
