---
id: v00122
title: "collapse 4-call bootstrap into 1-call `auto_work`"
kind: perf
status: in-progress
type: proposal
track: perf+token-budgets+agent-velocity
date: 2026-07-24
---

# v00122 — collapse 4-call bootstrap into 1-call `auto_work`

## Goal

Reduce the cold-start bootstrap from 4 sequential calls (`auto_work` → `proposals_compact_status` → `proposals_continue_proposal` → `delegate`) to 1 call by having `auto_work` return the next claim-ready slice + the slice's exact files + the lock claim hint, with optional delegated execution.

## why

Per F6 of a00067, the 4-call bootstrap costs ~1.2k tokens before the LLM executes anything. Reducing to 1 call saves ~600 tokens per work-cycle — the highest-ROI token optimisation in the project, independent of any language change.

## non-goals

- No language change — this is surface-design only.
- No change to `proposals_compact_status` / `continue_proposal` / `delegate` — they remain available for advanced flows.
- No change to the proposal frontmatter schema.

## Slices

- global_gate: e2e

### S1 — Extend `auto_work` payload with claim-ready slice + lock hint
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts`
- **Gate**: e2e
- acceptance:
  - "`auto_work` (work state) response now includes `claimReady: { sliceId, files, gate, agent_lock_args }` next to the existing plan steps."
  - "Existing `auto_work` test in `packages/core/tests/src/lib/agents/auto-work.spec.ts` still passes (response shape is additive)."
  - "New unit test: response includes the `claimReady` object on a work state."
  - "Token-budget regression gate (`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`) updated: `auto_work` budget moves from 1 600 B → 2 000 B to absorb the extra fields; idle stays at 159 B."

### S2 — Backward-compat: deprecation note for the old 4-call sequence
- **Status**: pending
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: type
- acceptance:
  - "Bootstrap section "Route work" updated to show the 1-call sequence as the canonical path; the 4-call sequence is preserved under an "advanced / debugging" subsection."
  - "Bootstrapping is unchanged for hosts that have not loaded the new auto-work payload — backward-compatible."

## acceptance

- `auto_work` (work state) response now includes `claimReady: { sliceId, files, gate, agent_lock_args }` next to the existing plan steps.
- Existing `auto_work` test in `packages/core/tests/src/lib/agents/auto-work.spec.ts` still passes (response shape is additive).
- New unit test: response includes the `claimReady` object on a work state.
- Token-budget regression gate (`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`) updated: `auto_work` budget moves from 1 600 B → 2 000 B to absorb the extra fields; idle stays at 159 B.
- Bootstrap section "Route work" updated to show the 1-call sequence as the canonical path; the 4-call sequence is preserved under an "advanced / debugging" subsection.
- Bootstrapping is unchanged for hosts that have not loaded the new auto-work payload — backward-compatible.
