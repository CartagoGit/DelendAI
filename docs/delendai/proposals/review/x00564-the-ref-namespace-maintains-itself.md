---
id: x00564
title: "The ref namespace maintains itself"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - automation
    - swarm
---

# x00564 — The ref namespace maintains itself

## goal

Names that drifted from the convention are corrected, refs the
integration branch already contains are removed, and neither depends on
an agent deciding to do it.

## why

Every piece of this already existed as something a person could run. The
convention has one source of truth (x00563), the reaper can prove a ref
spent (x00547), and the candidate refresh runs on its own (x00554 S2).
And yet, measured in this repository after all of that shipped:

```
delendai/wip/visual-studio-code/a00033-S2-g1-fix-the-agent-events-bridge-…
delendai/wip/visual-studio-code/a00033-S3-g1-decouple-loop-detector-…
delendai/wip/desktop-9ctqrs7/x00080-S3-g1-skill-bootstrap-documentation-…
delendai/pr/x00563-ref-shape                    ← its pull request merged
```

Four names that do not carry the shape, and a publication ref whose work
is in the integration branch. Nothing was broken; nobody ran the tools.

That is the whole finding: **a rule that depends on an agent remembering
is not a rule.** Giving agents rails is worth doing, but the part that
can be automatic has to actually be automatic, or the next agent — or
the same one, later — leaves the same mess.

## non-goals

- **No renaming that guesses.** A ref is renamed only when its own
  identity can still be read from the name; one that cannot be parsed is
  left exactly as it is and reported.
- **No reaping that assumes.** The proof is an empty three-dot diff
  against the integration branch: deleting the ref cannot lose a line.
  Age is never evidence.
- **No touching work in progress.** A ref a worktree has checked out is
  never renamed and never reaped, whatever it looks like from outside.

## slices

### S1 — One pass that renames, reaps, and proves both

- **Status**: done — `forge:namespace` walks the work and publication
  namespaces and, for each ref: leaves it alone if a worktree holds it;
  reaps it when the integration branch already contains everything it
  adds; renames it to the canonical name when its identity parses but
  its name has drifted. It reads the SAME parser the reconciler
  attributes refs with, so a rename can never produce a name the reader
  cannot read. Read-only by default.
- **Files**: `tools/scripts/git/maintain-ref-namespace.script.ts`,
  `tools/scripts/git/maintain-ref-namespace.interface.ts`,
  `tools/scripts/git/maintain-ref-namespace.script.spec.ts`,
  `package.json`
- **Gate**: `npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts`

### S2 — It runs when the branch moves, not when somebody remembers

- **Status**: done — the same trigger that refreshes stale candidates
  runs the maintenance pass: a local merge through `post-merge`, and a
  fast-forward performed by the running server's hydration watch. No
  agent decides; nothing waits for one.
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: `npx vitest run --project tools`

## acceptance

- After work lands, the ref that carried it disappears on the next time
  the integration branch moves here, without anybody asking.
- A ref whose name drifted is renamed to the canonical one, keeping its
  commit, and the old name is gone from this clone and the remote.
- A ref a worktree has checked out is never touched, and a ref sitting
  exactly at the integration tip is never reaped — a unit of work that
  has not checkpointed yet is indistinguishable from one whose work
  landed by fast-forward, and only one of those is safe to delete.
