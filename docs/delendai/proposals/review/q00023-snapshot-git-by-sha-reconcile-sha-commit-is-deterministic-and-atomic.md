---
id: q00023
title: "Snapshot Git by SHA — reconcile --sha <commit> is deterministic and atomic"
kind: plan
status: review
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
last-transition-id: 1bd969fe-207f-4fd4-afb3-6c33eae26eae
last-correlation-id: 1bd969fe-207f-4fd4-afb3-6c33eae26eae
last-transition-from: in-progress
shipped-in:
  - "4385f41e6bd9"
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

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/proposal-markdown-at-commit.spec.ts && bun test --timeout 30000 plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/proposal-markdown-at-commit.ts`
  - `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`
  - `plugins/proposals/tests/src/lib/services/proposal-markdown-at-commit.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`

**Rewritten 2026-09-29 against the tree.** The files this slice first
named (`reconciler/git-resolver.ts`, `reconciler/reconcile.ts`,
`sync-proposals.tool.ts`) do not exist. The reconciler already takes
`{ sourceCommit, files }` and never reads the disk, and it already
records `source_commit` in `reconciliation_runs`. What read the worktree
was its production caller, `proposals_db_reconcile`, and its
`sourceCommit` input was only a label: a run given a commit still read
the live worktree and attributed it to that commit.

`proposals_db_reconcile` now takes `ref` (a branch, tag or SHA). It is
resolved once, `git rev-parse --verify --end-of-options <ref>^{commit}`,
and the tree is read out of the object store at that SHA (`git ls-tree`
plus one `git cat-file --batch`), never from the worktree. The run is
attributed to the resolved SHA. A ref that reads as an option is refused.

Without `ref` the worktree stays the source, on purpose: the markdown is
the authority (q00022, `AUTHORITIES.md`) and a person's uncommitted edit
of a proposal is what the next reconcile must see. The SHA snapshot is
for a caller that wants the projection a commit held.

Proven: two runs at one commit give one logical digest after the
worktree gained a proposal nobody committed, while a worktree run sees
it; the files are the committed bytes (multi-byte text included) and
nothing outside the proposals tree is read.
- shipped-in: `4385f41e6bd9`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Revisé 4385f41e6bd9. El reconcile con ref resuelve el commit una sola vez con rev-parse protegido, lee el árbol de propuestas desde ese SHA con ls-tree/cat-file y atribuye la corrida al SHA resuelto; así la proyección deja de depender del worktree vivo. Corrí las specs focalizadas de proposal-markdown-at-commit + db-reconcile + sync-proposals-projection: 12/12 verde.
- review-attribution: claude-opus-5-5 from Merge pull request #668 from CartagoGit/delendai/pr/claude-opus-5-5/implement/q00023-all-g1/a-moved-branch-is-reported (refs/heads/delendai/wip/claude-opus-5-5/implement/q00023-all-g1/a-moved-branch-is-reported) (4385f41e6bd943e1b8229a0167633ef77edc8085), opened by minimax-3

### S2 — Drift detection: report when the ref moved mid-run

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/proposal-markdown-at-commit.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/proposal-markdown-at-commit.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/proposal-markdown-at-commit.interface.ts`
  - `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/services/proposal-markdown-at-commit.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/sync-proposals-projection.spec.ts`

Rewritten against the tree like S1 (`reconciler/drift.ts` and the sync
tool do not exist; the reconcile with a `ref` is `proposals_db_reconcile`).
When the run is done, `refDrift` asks again what `ref` names. The output
carries `drift: { from, to, reason }` when it no longer names the commit
the run read: `ref-moved` (a branch that moved) or `ref-gone` (deleted,
`to: null`). A SHA names itself for ever and never drifts. The drift is
reported, not acted on: the run is complete for the commit it read, and
running again is the caller's decision. The only external call is one
`git rev-parse`.
- shipped-in: `4385f41e6bd9`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Revisé 4385f41e6bd9. El output de db_reconcile ahora expone drift tipado y refDrift sólo vuelve a resolver el ref al final para reportar ref-moved o ref-gone sin re-leer ni reintentar la reconciliación; una SHA no deriva. Las mismas specs focalizadas quedaron 12/12 verde y cubren branch moved, ref gone y drift nulo para SHA.
- review-attribution: claude-opus-5-5 from Merge pull request #668 from CartagoGit/delendai/pr/claude-opus-5-5/implement/q00023-all-g1/a-moved-branch-is-reported (refs/heads/delendai/wip/claude-opus-5-5/implement/q00023-all-g1/a-moved-branch-is-reported) (4385f41e6bd943e1b8229a0167633ef77edc8085), opened by minimax-3

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