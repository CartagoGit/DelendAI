---
id: x00582
title: "The index goes back exactly"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - safety
shipped-in:
  - "bce54340b"
last-transition-id: 87a0c8fe-c6af-4cc4-a520-a9ae0e042072
last-correlation-id: 87a0c8fe-c6af-4cc4-a520-a9ae0e042072
last-transition-from: review
---

# x00582 — The index goes back exactly

## goal

A refused refresh leaves the index in the state it found it, including a
file that was only partly staged.

## why

x00577 stopped the rollback from restoring generated paths to HEAD, which
could have discarded uncommitted work. It kept, per path, the file's
bytes and a boolean: *was it staged*.

A boolean can express two of the three states a path can be in. The third
is ordinary: some hunks added, more editing still in the worktree —
exactly where somebody is in the middle of shaping a commit. Restoring
that with `git add` promotes the unstaged half, so the next commit
quietly contains more than its author staged.

Nothing is lost that way, and it is still wrong: the rollback's promise
is that a refusal costs nothing, and silently changing what a commit
would contain is a cost.

## non-goals

- Changing which paths are bounded. Still only the generated ones.
- Preserving anything outside those paths. Still untouched.

## architecture

The snapshot keeps git's own index entry — `<mode> <object>` from
`ls-files --stage` — instead of a boolean. On a refusal the bytes go back
and the entry is written with `update-index --cacheinfo`, which restores
the exact split between what was staged and what was not. A path the
index did not hold is unstaged as before.

## slices

### S1 — the rollback restores the index entry, not a summary of it

- **Status**: done
- **Files**: [`packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real bce54340b (merge #317; el candidato de la cola, 38fa526ff, era un merge de alineación). IPathSnapshot pasa de un booleano `staged` a la entrada exacta del índice (`<mode> <object>` de ls-files --stage): un booleano no puede representar el estado intermedio "half-staged" y restaurarlo con `git add` promovía la mitad unstaged, reescribiendo silenciosamente el próximo commit. Ahora el índice vuelve EXACTAMENTE a lo que era (update-index con la entrada guardada) y lo no trackeado no se toca. Acceptance cubierta: half-staged conserva contenido y entrada de índice; lo no held sigue untracked; lo establecido por x00577/x00570 se mantiene; el test nuevo fallaba contra la implementación booleana. Gate: 13/13 tests del spec en el worktree del batch. changedSince: sin commits posteriores que toquen el servicio. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit bce54340ba87 names refs/heads/delendai/wip/claude-opus-5/x00582-S1-g1/the-index-goes-back-exactly (bce54340ba87238bbd754f1d514ff04b3b64bd7a), opened by glm-5.3-max
## acceptance

- A half-staged file keeps its worktree content **and** its index entry:
  the unstaged half is still unstaged afterwards.
- A path the index did not hold stays untracked.
- Everything x00577 and x00570 established still holds.
- The new test **fails against the boolean implementation**.

## risks and mitigations

- **`update-index --cacheinfo` needs a valid mode and object.** Both come
  from git's own reading a moment earlier; when either is missing the
  path is skipped rather than guessed at.
