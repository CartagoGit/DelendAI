---
id: x00570
title: "The shared checkout is never left dirty"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - generated-artifacts
    - hooks
---

# x00570 — The shared checkout is never left dirty

## goal

After the integration branch hydrates, `git status` in the shared
checkout is empty. Always, and without an agent having to notice.

## why

The whole work-ref model rests on one visible promise: the shared
checkout sits on the integration branch and carries no modifications
anybody has to explain. It was broken again minutes after a merge:

```
$ git status --porcelain
M  docs/delendai/AGENT-BOOTSTRAP.md
```

Staged. On `develop`. By nobody.

`refreshGeneratedAfterMerge` regenerates the derived files after a merge
and commits them — correctly, because a merge that leaves generated
output stale is a merge that breaks the next push. It runs the commit
through the normal hooks, on purpose, so that where the policy refuses
the commit the refusal stands.

The refusal *did* stand. But `git add` had already happened, so the
refusal cost something: the regenerated file stayed in the index. On the
integration branch in the pinned checkout the policy refuses that commit
**every time**, which means the shared checkout was dirty after **every**
hydration, carrying a change no agent made and no branch can accept.

A second defect kept feeding it. `countPackages` listed the children of
`tools/` and filtered only dot-directories — so `tools/node_modules`, which
`bun install` creates because `tools` is itself a workspace, was counted
as a workspace:

```
Workspaces: 11 packages, 2 apps, 1 extensions, 4 tooling workspace(s).
                                               ^ 3 on a machine without
                                                 dependencies installed
```

A "quantitative fact" that measures the state of the installer rather
than the repository. It flipped the block's substantive content, which
defeated the careful machinery that otherwise holds the timestamp still,
which regenerated the block, which staged it, which dirtied the checkout.

## non-goals

- Letting the refresh commit to the integration branch. The refusal is
  correct; it simply has to be free.
- Removing the quantitative block. Its numbers are useful; one of them
  was measuring the wrong thing.
- Changing what the generators produce.

## architecture

When the commit is refused, the service puts the paths back exactly as it
found them — `git restore --staged` then `git checkout HEAD --` over the
same bounded path list it staged. The content is derived: a stale
generated file on the integration branch is the status quo and the
candidate refresh regenerates it, whereas a dirty shared checkout is a
broken invariant.

`listDirs` gains an explicit never-a-workspace set, so the count answers
the same on a machine with dependencies installed and one without.

## slices

### S1 — a refused commit costs nothing, and a workspace count is not an install count

- **Status**: review
- **Files**: [`packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`, `tools/scripts/gen/quantitative.script.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`

## acceptance

- With a hook that refuses the commit, the refresh reports
  `committed: false` and leaves `git status --porcelain` empty, the file
  byte-identical to `HEAD`, and no commit written.
- `countPackages()` reports `tools: 3` whether or not `tools/node_modules`
  exists.
- The existing refresh behaviour is unchanged where the commit is allowed.

## risks and mitigations

- **The integration branch keeps a stale generated file.** It already
  did, since the commit was always refused there. The difference is that
  the staleness is now invisible instead of sitting in the index. The
  candidate refresh (x00565) regenerates it on the branch that can carry
  the commit.
