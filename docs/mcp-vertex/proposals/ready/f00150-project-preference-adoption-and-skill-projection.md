---
id: f00150
title: "project-preference adoption and skill projection"
kind: feat
status: ready
type: proposal
track: adoption+skills+dx
date: 2026-07-25
---

# f00150 — project-preference adoption and skill projection

## Goal

Make using mcp-vertex from a consumer repository genuinely self-configuring:
recommendations fill missing setup, but the consumer project's committed
configuration always remains authoritative.  Install the canonical skills into
a portable project-owned projection so every compatible host can discover or
load them without relying on the mcp-vertex monorepo layout.

## Why

The existing bootstrap detects skills and exposes `copyCoreSkills`, yet the
flag only reports an intention.  It also refuses or replaces an existing
configuration rather than merging it.  That makes repeated adoption unsafe and
means a library or CLI consumer can look configured while its agents lack the
skills that make the workflow effective.

## Rules

- Existing valid project configuration wins over generated defaults.
- Bootstrap is additive and idempotent; `--force`/`overwrite:true` is the only
  intentional replacement path.
- Skills are copied with a manifest and content identity; existing target
  skills are never overwritten silently.
- The MCP path and the CLI path share the same merge semantics.

## Slices

### S1 — shared preference-preserving config merge

- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/merge-derived-config.ts`,
  `packages/core/tests/src/lib/bootstrap/merge-derived-config.spec.ts`,
  `packages/core/src/lib/bootstrap/init-config-tool.ts`,
  `packages/cli/src/lib/init/init-writers.factory.ts`
- **Gate**: type + focused tests

### S2 — portable skill projection

- **Status**: done
- **Files**: `packages/cli/src/lib/init/core-skill-projection.service.ts`,
  `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/core/package.json`,
  `packages/cli/package.json`
- **Gate**: focused tests + package contents check

### S3 — host-aware adoption report and idempotency coverage

- **Status**: done
- **Files**: `packages/cli/src/commands/init/init.command.ts`,
  `packages/cli/src/lib/init/init-human-summary.service.ts`,
  `packages/cli/src/lib/init/init-integration.spec.ts`
- **Gate**: type + integration tests

## Acceptance

- Re-running bootstrap adds only absent defaults and preserves project plugin
  entries/options.
- `init_config { write:true }` and `mcpv init` use the same precedence rules.
- `copyCoreSkills:true` writes an inspectable, project-owned skill projection
  and reports its precise outcome.
- No host is promised autonomous execution it cannot support; skills remain
  available over the universal MCP surface and native adapters may project them.
