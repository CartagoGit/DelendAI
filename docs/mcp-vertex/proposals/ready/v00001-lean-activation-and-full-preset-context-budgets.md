---
id: v00001
title: "Lean activation and full-preset context budgets"
kind: perf
status: ready
type: proposal
track: presets+metrics+token-efficiency
date: 2026-07-24
---

# v00001 — Lean activation and full-preset context budgets

## Goal

Minimize static and runtime context overhead through explicit lightweight activation and regression budgets for the real consumer preset surface.

## why

The normal development host launches the collaboration preset, while the hard
token baseline primarily covers a smaller surface. A context-saving promise is
only credible when the actual preset has a regression budget and users can
select a lighter surface for ordinary work without hand-curating plugin lists.

## non-goals

- No breaking default-preset change without before/after measurements and a
  migration decision.
- No removal of capabilities from users who intentionally choose the full
  collaboration surface.

## Slices

- global_gate: validate

### S1 — Measure the real preset surface
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: token-budget e2e
- **Acceptance**: `tools/list`, compact orientation and the main resume path
  are measured against the actual collaboration preset.

### S2 — Make lightweight activation discoverable
- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`, `docs/mcp-vertex/CROSS-IDE.md`, `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`
- **Gate**: host launch tests + docs checks
- **Acceptance**: a user can explicitly choose the lightweight path for a
  simple task and elevate to collaboration only when needed.

### S3 — Budget regression and guidance loop
- **Status**: pending
- **Files**: `config/metrics-baseline.json`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: metrics gate + prompt-size
- **Acceptance**: budget growth requires an intentional, evidence-backed
  decision; instructions remain below their static size cap.

## acceptance

- The active consumer preset, not a proxy, has reproducible token measurements.
- The lightweight path is documented without silently changing existing users.
- Context-saving documentation never itself causes an instruction-budget
  regression.
