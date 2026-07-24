---
id: c00123
title: "config-level toggle for `exactOptionalPropertyTypes`"
kind: chore
status: ready
type: proposal
track: tooling+llm-velocity+optional
date: 2026-07-24
---

# c00123 — config-level toggle for `exactOptionalPropertyTypes`

## Goal

Make the `exactOptionalPropertyTypes` TS strict flag opt-out-able (default ON) so projects that hit the 3-7% LLM fix-cycle cost (per F3 of a00067) can disable it without forking the build. Document the trade in `AGENT-BOOTSTRAP.md`.

## why

The flag adds friction for LLMs without lifting the runtime quality bar (a00067 F3 / DC5). A config-level toggle is a 1-day change with no runtime impact — the safe path is to keep it ON by default but allow opt-out.

## non-goals

- Removing the flag entirely — ON by default, opt-out only.
- Refactoring the ~10 sites that use `...(value !== undefined ? { key: value } : {})` — left as-is.
- Per-file opt-out — the toggle is workspace-wide.

## Slices

- global_gate: type

### S1 — Add the opt-out knob (env var or tsconfig toggle)
- **Status**: pending
- **Files**: `tsconfig.base.json`, `tools/scripts/typecheck.script.ts`
- **Gate**: type
- acceptance:
  - "`MCP_VERTEX_RELAX_EXACT_OPTIONAL=1 npm run typecheck` succeeds with the flag off."
  - "Default run (env unset) keeps the flag ON and the project typechecks."
  - "Existing `bun run validate` is unchanged."

### S2 — Document the trade in `AGENT-BOOTSTRAP.md`
- **Status**: pending
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "New section "Optional: relax `exactOptionalPropertyTypes`" under "Tooling posture", with the env var name, the trade (3-7% LLM fix-cycle cost, no runtime benefit), and a pointer to a00067 F3 for context."

## acceptance

- `MCP_VERTEX_RELAX_EXACT_OPTIONAL=1 npm run typecheck` succeeds with the flag off.
- Default run (env unset) keeps the flag ON and the project typechecks.
- Existing `bun run validate` is unchanged.
- New section "Optional: relax `exactOptionalPropertyTypes`" under "Tooling posture", with the env var name, the trade (3-7% LLM fix-cycle cost, no runtime benefit), and a pointer to a00067 F3 for context.
