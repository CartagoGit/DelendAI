---
id: x00561
title: "An operation that is safe alone must be safe in sequence"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - data-loss
    - release
    - ci
    - isolation
shipped-in:
  - "1db4ea316"
---

# x00561 — An operation that is safe alone must be safe in sequence

## goal

Each step of a chain stays correct when the step before it succeeded and
the step after it has not run yet. Nothing destroys what it did not
prove, and nothing publishes half of something.

## why

An external audit of this repository read the code that shipped over the
last day and found four defects, all of the same shape: every operation
is right in isolation and wrong in sequence.

**Publishing could delete unpublished work.** `work publish` proved the
published commit reached the remote and then ran
`git worktree remove --force`. Proving that the CHECKPOINT reached the
forge says nothing about edits made after it: an agent that checkpointed
and kept working would lose everything it had not checkpointed yet. The
refusal that exists — never remove the worktree the caller is standing in
— does not cover another process publishing that unit of work.

**A tag release could publish and then fail.** A tag run is triggered BY
the tag it would create, so `git tag "v$VERSION"` fails on an existing
name, and `set -euo pipefail` kills the job. By then npm has published:
a release that exists on the registry, has no GitHub Release, and ends
red.

**The regenerator could commit somebody else's staged work.**
`git commit -m …` with no paths commits the WHOLE index, so an agent that
had already run `git add` on its own files would have them absorbed into
`chore(generated): recompute after a merge`. The existing test left a
file dirty but never staged it, so it passed while the promise was
broken.

**The queue stopped cleaning up exactly when it mattered.** x00557 made
the report end red when the queue is stuck; the reaping step that follows
is skipped by default when a step fails — and a stuck queue is precisely
when finished refs pile up.

And one the audit named that this repository had already half-fixed: the
CLI still resolved `origin` by hand for the integration base and for
publishing, while the reconciler had moved to a resolved remote (x00558
S3).

## non-goals

- **No weakening of any proof.** Publishing still refuses to end a work
  ref until the remote reports the same commit; this adds a second
  precondition rather than relaxing the first.
- **No automatic conflict resolution or forced writes.**

## slices

### S1 — Publishing never deletes work it did not publish

- **Status**: done
  is gone, and a tree with uncommitted changes keeps both the worktree
  and the work ref, saying what it found and what to do. A state that
  cannot be read is treated the same way.
- **Files**: `packages/cli/src/lib/work-publish.service.ts`,
  `packages/cli/src/lib/work-publish.service.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 1db4ea316 (x00561 S1, merge PR #288). fix(workflow): an operation that is safe alone must be safe in sequence — work-publish.service.ts inspecciona el worktree antes del remove y mata `--force`; un tree con cambios sin commit mantiene worktree + work ref y dice qué encontró. Un estado ilegible se trata igual. 16/16 verde en work-publish.service.spec.ts cubre los 4 casos (tree clean, tree dirty, tree illegible, tree ya removido). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 1db4ea316f3a0aa41440d230d264423b83511541: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S2 — A tag release reuses the tag that triggered it

- **Status**: done
  pointing elsewhere fails BEFORE anything is published; a push that
  races is accepted when the remote already carries the same commit.
- **Files**: `.github/workflows/release.yml`
- **Gate**: `bun run lint:workflow-yaml`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 1db4ea316 (x00561 S2). .github/workflows/release.yml reusa un tag existente en el mismo commit, falla ANTES de publicar si el tag apunta a otro commit, y acepta push raceado si el remoto ya carga el mismo commit. bun run lint:workflow-yaml exit 0 (16 workflows válidos). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 1db4ea316f3a0aa41440d230d264423b83511541: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S3 — The regenerator commits only what it generated

- **Status**: done
  file belonging to another agent cannot be swept in. The test now stages
  the other agent's file, which is the case that was passing for the
  wrong reason.
- **Files**: `packages/cli/src/lib/generated-refresh.service.ts`,
  `packages/cli/src/lib/generated-refresh.service.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 1db4ea316 (x00561 S3). generated-refresh.service.ts ahora nombra los paths generados en el commit (no `git commit -m …` sin paths que captura todo el index). 13/13 verde en generated-refresh.service.spec.ts; el test ahora STAGE el archivo del otro agente (que era el caso que pasaba por la razón equivocada). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: unrecorded — nothing in Git names who delivered 1db4ea316f3a0aa41440d230d264423b83511541: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

### S4 — The reaper runs even when the report is red

- **Status**: done — `if: always()`, so a stuck queue no longer costs the
  cleanup that keeps the namespace readable.
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: `bun run lint:workflow-yaml`

### S5 — The CLI integrates with the same remote the reconciler does

- **Status**: done — `work` resolves the integration remote from what the
  integration branch tracks, then `origin`, then the only remote there
  is, for both the base it checkpoints against and the remote it
  publishes to.
- **Files**: `packages/cli/src/commands/work.command.ts`
- **Gate**: `npx vitest run --project @delendai/cli`

## acceptance

- Publishing a unit of work whose worktree has uncommitted changes leaves
  the worktree, the files and the work ref untouched, and says why.
- Pushing a `vX.Y.Z` tag reaches the GitHub Release step; a tag that
  names a different commit fails before anything is published.
- A refresh commit contains only generated paths, even when another
  agent's file is already staged.
- A run that reports a stuck queue still reaps finished refs.
- A project whose only remote is `upstream` checkpoints and publishes
  without naming a remote by hand.
