---
id: x00603
title: "The worktree reads are declared"
kind: fix
status: review
type: proposal
track: ci
date: 2026-09-22
tags:
    - ci
    - plugins
shipped-in:
  - "37de626d67d83506d442721de6183e036636fec2"
---

# x00603 — The worktree reads are declared

## goal

`develop` is green.

## why

x00601 taught `resolveHeadCommit` about worktrees: `.git` is a FILE
there, naming the real git directory, and the refs it points at live in
the **common** one. Three `readFileSync` calls followed.

`plugin-drift-budget` keeps sync I/O in plugin source deliberate by
naming every occurrence, keyed on the source line. The three new lines
were not in that list, and one existing entry stopped matching because
its line changed from `gitDir` to `commonDir`.

So the gate went red **on `develop`**, after the merge, rather than on
the change that caused it — and every open pull request inherited it.

## non-goals

- Relaxing the gate. It is right: a plugin reading the filesystem
  synchronously is a decision, and decisions get written down.

## architecture

The three lines join `SYNC_IO_ALLOWLIST`, next to the entries for the
same probe, with the reason: it reads git's plumbing directly rather
than spawning git, because it runs inside a reconcile that must not pay
a subprocess per call.

## slices

### S1 — the three reads are named

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/plugin-drift-budget.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/plugin-drift-budget.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 37de626d6. plugin-drift-budget añade el tercer presupuesto: 0 llamadas sync node:fs en plugins/*/src fuera de la allowlist documentada (las lecturas del worktree se DECLARAN, no se ocultan); los otros dos presupuestos del spec no se tocan y siguen pasando en develop. Cambio de 82 líneas (13 del spec + allowlist). Acceptance cubierta; gate verificado en el lote 63/63. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit 37de626d67d8 names refs/heads/delendai/wip/claude-opus-5/x00603-S1-g1/the-worktree-reads-are-declared (37de626d67d83506d442721de6183e036636fec2), opened by glm-5.3-max
## acceptance

- `0 sync node:fs calls in plugins/*/src outside the documented
  allowlist` passes on `develop`.
- The other two budgets in that spec are untouched and still pass.

## risks and mitigations

- **An allowlist that grows by habit.** Each entry is keyed on the exact
  source line, so a changed line stops matching and has to be looked at
  again — which is exactly how this one surfaced.

## notes

The gate caught the right thing and said so clearly; what it could not
do is catch it before the merge, because the pull request that added the
reads was measured against a `develop` that did not yet contain them.
