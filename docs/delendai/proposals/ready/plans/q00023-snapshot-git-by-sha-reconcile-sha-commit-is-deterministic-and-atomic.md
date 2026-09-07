---
id: q00023
title: "Snapshot Git by SHA — reconcile --sha <commit> is deterministic and atomic"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-RECONCILE-SHA-009
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - q00024
---

# q00023 — Snapshot Git by SHA

## Goal

Make every reconciliation resolve Git refs to an immutable commit SHA
before it begins, so the reconcile operates on a stable snapshot that
cannot move underneath it. The new tool shape is
`delendai reconcile --sha <commit>` (or `--ref <branch>` resolved at
call time). Two calls with the same SHA MUST produce the same
operational state, even if the underlying branch moved between them.

## Why

The audit calls this out as P0 because the current proposals reconciler
("sync_proposals") reads the worktree in real time:

> Git debe reconciliarse por SHA inmutable. Nunca debería ocurrir esto:
> `reconcile("develop")` y seguir leyendo develop mientras se mueve.
> Primero: develop → `91bbbff76ce35452c8c8b6e3bf2129a490bf7c94`. Y a
> partir de ahí toda la reconciliación trabaja contra ese SHA. Al
> acabar: `source_commit = 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94`.
> Si develop ya apunta a otro commit, no pasa nada.

Without this invariant, two consecutive reconciles can read the same
proposal at two different states (because the working tree changed
mid-reconcile), producing flaky `logical_digest` outputs and "the
proposal that was just there is gone" symptoms.

## Why this design

**SHA resolved once.** The first thing `reconcile()` does is call
`git rev-parse <ref>` (or accept a SHA directly), record the resolved
SHA, and freeze it for the entire reconciliation run. All subsequent
file reads use `git show <sha>:<path>` (or worktree-at-<sha>
equivalent), never the live worktree.

**Stored in reconciliation_runs.** Every reconciliation writes
`source_commit`, `source_tree`, `reconciler_version`, `schema_version`,
`logical_digest`, `started_at`, `completed_at`, and `status` to the
`reconciliation_runs` table. Two runs with the same SHA MUST have the
same `logical_digest`.

**Drift surface.** When a reconcile ends and `git rev-parse develop`
no longer equals `source_commit`, the tool returns `drift: {
from: '<sha>', to: '<sha>', reason: 'branch moved' }` as part of the
response. It does NOT silently re-run.

## Non-goals

- Do NOT change the public MCP tool name; `proposals_sync_proposals`
  gains optional `--sha` and `--ref` parameters; old behaviour (default
  ref = HEAD) is preserved.
- Do NOT change the SHA-pin semantics in this proposal — `q00024`
  owns the staging-vs-active dance.

## Slices

- global_gate: lint

### S1 — Resolve Git refs at call time and freeze the SHA for the entire reconcile

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler/git-resolver.ts`
    (new — `resolveSha({ ref?, sha? }) → string`)
  - `packages/proposals-sqlite/src/lib/reconciler/reconcile.ts`
    (modified — accepts `{ sha?: string; ref?: string }`,
    always works against `sha`)
  - `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`
    (modified — exposes the new options)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/git-resolver.spec.ts`
    (new)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/reconcile.spec.ts`
    (modified)
- **Gate**: type
- acceptance:
  - `reconcile({ ref: 'develop' })` calls `git rev-parse develop`,
    captures `resolvedSha`, and uses it for every subsequent file read.
  - `reconcile({ sha: '<sha>' })` skips the rev-parse call and uses
    the SHA directly (no network, no worktree access).
  - The reconciliation run writes `source_commit = resolvedSha` to
    `reconciliation_runs`.
  - Two calls with the same SHA against the same DB produce the same
    `logical_digest`.
  - `bun run typecheck` is green and `bunx vitest run packages/proposals-sqlite` is green.

### S2 — Drift detection: report when the ref moved mid-run

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler/drift.ts`
    (new)
  - `packages/proposals-sqlite/src/lib/reconciler/reconcile.ts`
    (modified — appends drift to the response)
  - `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`
    (modified — surfaces drift)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/drift.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - After reconcile completes, the tool re-reads the ref and compares
    it with the captured `source_commit`. If they differ, the response
    carries `{ drift: { from: '<sha>', to: '<sha>', reason:
    'branch-moved' | 'detached' } }`.
  - The drift is reported, NOT acted on. The reconcile run is
    considered complete; the host decides whether to re-run.
  - `git status` and `git rev-parse HEAD` are the only external calls
    in the drift step.

## acceptance

- All S1-S2 slices land.
- `delendai reconcile --sha <sha>` and `delendai reconcile --ref
  develop` (which is equivalent to a default ref) both produce stable
  `logical_digest` outputs.
- `reconciliation_runs.source_commit` is never null after a successful
  reconcile.

## notes

- This proposal depends on `q00022` S1+S2 (schema + reconciler) being
  in place first; the storage primitives must exist before SHA-pinning
  can be persisted.