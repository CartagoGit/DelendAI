---
id: x00690
title: "A pull request not opened from a publication is closed"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644, x00677]
last-transition-id: db4d6280-0edb-4626-8319-3c2ed19dcfd9
last-correlation-id: db4d6280-0edb-4626-8319-3c2ed19dcfd9
last-transition-from: review
shipped-in:
  - "0bcc0b357bf654e666a0f779e46459338e2f2807"
---

# x00690 — A pull request not opened from a publication is closed

## goal

An open pull request whose head is not a publication does not sit in the
repository red and stale. The queue closes it, says why, and says how to
publish. Its branch is never touched.

## why

#514 was opened by hand from MiniMax's work ref
`delendai/wip/minimax-3/review/f00553-review-g1/review`. `pr-head-shape`
failed it in CI, as designed. Nothing acted on that failure:

- the owner machine brings only publications forward;
- the queue arms only publications;
- the ref reaper touches only finished pull requests.

The pull request stayed open, red and conflicting, and the owner kept
finding it among the branches that "never get rehydrated".

## why this design

- **One judge.** The queue uses `prHeadProblem`, the check CI already
  runs. What CI fails is what the queue closes, and nothing else.
- **Close, never delete.** The branch may be the only copy of the work
  (x00687), so it is left as it is. The comment says what `work publish`
  does, which is the one way a pull request is opened.
- **Forks are not judged** by this repository's namespaces.

## non-goals

- Deciding what happens to the work on the branch. That is its author's
  to publish.

## architecture

- `tools/scripts/forge/close-unpublished-prs.script.ts`:
  `unpublishedPullRequests`, `closingComment`.
- `.github/workflows/keep-the-queue-moving.yml`: a step after the reap.

## Slices

- global_gate: none

### S1 — The queue closes unpublished pull requests

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/close-unpublished-prs.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/close-unpublished-prs.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.spec.ts`
  - `.github/workflows/keep-the-queue-moving.yml`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 0bcc0b357. Un PR no abierto desde una publicación se CIERRA: close-unpublished-prs selecciona PRs cuyo head es un work ref o está fuera de los namespaces; una publication y un fork NO se seleccionan; corrido read-only contra el repo vivo seleccionaba #514 y nada más (verificado por el implementador en su momento). Script 100 líneas + spec 51; workflow wire +11. Acceptance cubierta; gate 29/29 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A pull request from a work ref, or from outside the namespaces, is
  selected. A publication and a fork are not.
- Run read-only against the live repository, it selects #514 and
  nothing else.
