---
id: f00139
kind: feat
title: self-audit dogfood loop — one tool that runs every scanner and emits a single ranked action backlog (the project improving itself each round)
status: done
date: 2026-07-23
track: plugin+audit+self-improvement
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing f00139 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 97723a45 # feat(audit): f00139 S3 — file proposals + catalog + README
  - eb87de23 # feat(audit): f00139 S2 — rank + tool registration
  - fdc99f83 # feat(f00139): S2 self-audit rank + tool (audit plugin)
  - 2c30060b # feat(audit): f00139 S1 — aggregate scanner findings
  - 676008f8 # feat(config,proposals): activate router in this repo + 4 self-improvement propos
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

- **Status**: done
- **Files**: `plugins/audit/src/lib/self-audit/aggregate.ts`, `plugins/audit/src/lib/contracts/interfaces/self-audit.interface.ts`, `plugins/audit/tests/src/lib/self-audit/aggregate.spec.ts`
- **Gate**: bun run validate
- **Commit**: `2c30060b` (slice), `a0f47ffc` (JSDoc enrichment)

Collect `IFinding[]` from every available scanner (each optional; missing ones
skipped with a note) into one `ISelfAuditReport`. Pure over injected scanner
runners. Implements `aggregateSelfAudit(options: ISelfAuditOptions): Promise<ISelfAuditReport>`,
reuses `aggregateScans` from `@mcp-vertex/core/public` (r00012) so this plugin
owns zero detection logic. 9/9 new tests pass; full audit plugin suite
77/77. `bun run validate` blocked on a pre-existing f00137
`proposal-files-exist` failure (skills-pack skills referenced in
`done/feats/f00137-skills-pack.md` that never shipped) — unrelated to f00139.

### S2 — rank into a single action backlog

- **Status**: done
- **Files**: `plugins/audit/src/lib/self-audit/rank.ts`, `plugins/audit/src/lib/tools/self-audit.tool.ts`
- **Gate**: bun run validate

Pure ranker (severity × blast-radius × effort) → ordered backlog, reusing the
`audit` scoring. `self_audit` surfaces the top-N with rationale (CLI +
extension).

Landed the pure `rankFindings()` backlog scorer plus the
`<prefix>_self_audit` tool registration, and added focused acceptance coverage
for empty input, severity ordering, truncation, tie-breaking, effort buckets,
and caller-provided weight overrides. Commit: `eb87de23`.

### S3 — optional proposal filing + catalog

- **Status**: done
- **Files**: `plugins/audit/src/lib/self-audit/file-proposals.ts`, `plugins/audit/README.md`
- **Gate**: bun run validate

On consent, file the top items as proposals via `proposals_create_proposal`;
catalog + wiki.

Landed a pure `fileProposalsFromBacklog()` helper that turns ranked backlog
items into minimal consent-gated proposal drafts, writes them atomically,
skips identical reruns, and documents the `self_audit` filing flow in the
audit plugin README. Commit: `97723a45`.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- `self_audit` on this repo returns a single ranked backlog aggregating ≥3
  scanners; missing scanners are noted, never fatal.
- Filing is consent-gated and produces valid proposals.

## notes

Reuses the `audit` scoring, r00012 finding shape, and `proposals`. Aggregates
f00122/f00126/f00136/conventions/deps. The self-improvement flywheel.
