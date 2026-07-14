---
id: x00106
title: "Proposals authoring ergonomics — close_slice self-heals a stale index; transitions keep git history for fresh files"
kind: fix
status: ready
type: proposal
track: proposals+dx
date: 2026-07-14
---

# x00106 — Proposals authoring ergonomics — close_slice self-heals a stale index; transitions keep git history for fresh files

## Goal

Two paper cuts that bit twice in one live session: (1) close_slice returns "proposal file missing: …/ready/<file>" when the proposal moved folders since the last index write, forcing the agent to call sync_proposals by hand and retry — the tool should re-sync once and retry internally before erroring. (2) proposal_transition on a file created in the same session falls back to a plain rename with a scary "blame history not preserved" warning because create_proposal never stages its output — the fresh file is untracked, so there IS no history to lose; either stage on create (git add --intent-to-add) or detect untracked and demote the warning.

## why

Audit a00054 F-2/F-3. Evidence: authoring.tool.ts:473,658,699 (three "proposal file missing" sites that read the stale indexed path), proposal-transition.tool.ts:381 + recovery-tools.ts:310 (git mv fallback warning). Live repro 2026-07-14: close_slice failed for f00115 S1 and f00113 S1 right after their transitions; both healed with a manual sync_proposals + retry — exactly the loop the tool can run itself.

## non-goals

- No auto-commit — staging intent (add -N) at most; committing stays the agent's decision.
- No index redesign; one bounded re-sync retry, not a polling loop.

## Slices

- global_gate: e2e

### S1 — close_slice (and siblings reading the indexed path) re-sync once on missing file, then retry
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/authoring-stale-index.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Spec: create → transition (index now stale) → close_slice succeeds without a manual sync_proposals; a genuinely missing proposal still errors with the same structured reason after the single re-sync."

### S2 — Transitions keep history for fresh files: stage on create or detect-untracked and adjust the fallback
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/tests/src/lib/transition-untracked-file.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Transitioning an untracked (just-created) proposal produces no 'blame history was not preserved' warning; transitioning a TRACKED file still uses git mv and warns only when git mv genuinely fails."

## acceptance

- Spec: create → transition (index now stale) → close_slice succeeds without a manual sync_proposals; a genuinely missing proposal still errors with the same structured reason after the single re-sync.
- Transitioning an untracked (just-created) proposal produces no 'blame history was not preserved' warning; transitioning a TRACKED file still uses git mv and warns only when git mv genuinely fails.
