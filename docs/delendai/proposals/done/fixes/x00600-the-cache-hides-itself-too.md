---
id: x00600
title: "The cache hides itself too"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-22
tags:
    - adoption
    - safety
shipped-in:
  - "e4cb5c596e3bb3ef987e471aea187f05dcbcf970"
last-transition-id: 26935704-6391-4180-8cd1-fe1ff2569a1a
last-correlation-id: 26935704-6391-4180-8cd1-fe1ff2569a1a
last-transition-from: review
---

# x00600 — The cache hides itself too

## goal

Running a command in somebody's project leaves `git status` as it found
it.

## why

x00598 moved the workflow doctor into the product so a project that is
not delendai could ask whether the work-ref model was holding. The first
time it was pointed at one, it answered:

```
✗ checkout-clean  the shared checkout carries no modifications
  BROKEN — 3 path(s): ?? .cache/, ?? .delendai/, ?? stray.ts
```

Two of those three are ours. x00596 taught `.delendai/` to hide itself
and left this one: running any command creates `<cacheDir>/` with a
sqlite database, a blueprint and an event log in it, and git shows the
lot.

It is the same defect as x00596, in the directory it did not reach, and
it is the more visible one — `.cache/delendai/` appears on the first
command anybody runs, where `.delendai/` waited for a migration.

## non-goals

- Hiding `.cache/` itself. That directory may be the project's, with the
  project's own things in it, and hiding those would be a different kind
  of wrong.

## architecture

`ensureSelfIgnoringDir` replaces the bare `mkdir` in
`bootstrapCacheLayout`. The ignore lands on the RESOLVED cache
directory — `<cacheDir>/.gitignore` containing `*` — so it covers
delendai's subtree and nothing else, whatever the project configured its
`cacheDir` to be.

git does not report a directory whose every entry is ignored, so
`?? .cache/` disappears while `.cache/theirs/` keeps showing.

## slices

### S1 — the resolved cache directory ignores itself

- **Status**: done
- **Files**: [`packages/core/src/lib/cache/cache-layout-bootstrap.ts`, `packages/core/tests/src/lib/cache/cache-layout-bootstrap.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/cache/cache-layout-bootstrap.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real e4cb5c596. cache-layout-bootstrap añade un .gitignore DENTRO de .cache/delendai/ (la caché se esconde a sí misma sin tocar el .gitignore del proyecto): tras el bootstrap y escritura, git status --porcelain solo reporta el untracked propio del proyecto; git add -A stagea solo lo del proyecto; un .cache/theirs/ ajeno sigue viéndose tanto como .cache/ como con --untracked-files=all. Verificado contra repo git real (coherente con x00596/x00583). Acceptance cubierta — cache-layout-bootstrap.spec 79 líneas; gate 9/9 en lote. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit e4cb5c596e3b names refs/heads/delendai/wip/claude-opus-5/x00600-S1-g1/the-cache-hides-itself-too (e4cb5c596e3bb3ef987e471aea187f05dcbcf970), opened by glm-5.3-max
## acceptance

Measured against a real git repository:

- After bootstrapping the cache and writing into it, `git status
  --porcelain` reports only the project's own untracked file.
- `git add -A` stages only the project's file.
- A project's own `.cache/theirs/` is still reported, both as `.cache/`
  and, with `--untracked-files=all`, as `.cache/theirs/build.json`.
- 3458 core tests pass.

## risks and mitigations

- **A project that wants its cache in version control.** It removes the
  `.gitignore`; the helper never rewrites one that exists.

## notes

The doctor found this the first time it was asked a question about a
project other than its own, which is the argument x00598 made for
shipping it and did not expect to have proved quite so quickly.
