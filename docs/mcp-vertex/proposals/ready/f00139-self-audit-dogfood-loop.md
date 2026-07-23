---
id: f00139
kind: feat
title: self-audit dogfood loop — one tool that runs every scanner and emits a single ranked action backlog (the project improving itself each round)
status: ready
date: 2026-07-23
track: plugin+audit+self-improvement
---

# f00139 — self-audit dogfood loop

## goal

A `self_audit` orchestration tool (extending the existing `audit` plugin) that
runs **every gated scanner the project has** — security (f00122), perf
(f00126), coverage/complexity (f00136), conventions, deps, and the finding
producers — and folds their results into **one ranked action backlog** with a
single prioritised "do this next" list, optionally filing the top items as
proposals. It is the concrete "the project works on itself and gets better each
round" loop.

## why

mcp-vertex already ships an `audit` plugin and many individual checks, but the
signal is scattered across tools an agent must invoke and reconcile by hand.
A single self-audit that aggregates and ranks turns "run six tools, read six
outputs" into "here is the highest-value thing to fix," directly serving the
user's vision of a toolkit that improves itself using itself, round after round.

## why this design

Aggregation only — `self_audit` **composes** the existing scanners through the
shared finding shape (r00012), so it adds no new detection logic and cannot
drift from the sources. Ranking is a **pure** function over the collected
`IFinding[]` (severity × blast-radius × cheap-to-fix), reusing the `audit`
plugin's existing scoring. Filing proposals reuses `proposals_create_proposal`.
Everything is opt-in and read-only until the user consents to file.

## non-goals

- No new detectors — it only aggregates and ranks existing scanner output.
- No auto-fix and no auto-filing without explicit consent.
- Not a replacement for `validate` — it prioritises; `validate` gates.

## slices

### S1 — aggregate scanner findings

- **Status**: pending
- **Files**: `plugins/audit/src/lib/self-audit/aggregate.ts`, `plugins/audit/src/lib/contracts/interfaces/self-audit.interface.ts`
- **Gate**: bun run validate

Collect `IFinding[]` from every available scanner (each optional; missing ones
skipped with a note) into one `ISelfAuditReport`. Pure over injected scanner
runners.

### S2 — rank into a single action backlog

- **Status**: pending
- **Files**: `plugins/audit/src/lib/self-audit/rank.ts`, `plugins/audit/src/lib/tools/self-audit.tool.ts`
- **Gate**: bun run validate

Pure ranker (severity × blast-radius × effort) → ordered backlog, reusing the
`audit` scoring. `self_audit` surfaces the top-N with rationale (CLI +
extension).

### S3 — optional proposal filing + catalog

- **Status**: pending
- **Files**: `plugins/audit/src/lib/self-audit/file-proposals.ts`, `plugins/audit/README.md`
- **Gate**: bun run validate

On consent, file the top items as proposals via `proposals_create_proposal`;
catalog + wiki.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- `self_audit` on this repo returns a single ranked backlog aggregating ≥3
  scanners; missing scanners are noted, never fatal.
- Filing is consent-gated and produces valid proposals.

## notes

Reuses the `audit` scoring, r00012 finding shape, and `proposals`. Aggregates
f00122/f00126/f00136/conventions/deps. The self-improvement flywheel.
