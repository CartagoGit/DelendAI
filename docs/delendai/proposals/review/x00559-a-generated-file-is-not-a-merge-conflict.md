---
id: x00559
title: "A generated file is not a merge conflict"
kind: fix
status: review
type: proposal
track: efficiency
date: 2026-09-19
tags:
    - git
    - merge
    - generated
    - swarm
---

# x00559 — A generated file is not a merge conflict

## goal

Two units of work that touch nothing in common stop conflicting. A file
nobody writes is merged by the thing that writes it.

## why

Measured across this whole session. Every candidate in this repository
conflicts with every other one, always on the same two files:

```
CONFLICT (content): Merge conflict in docs/delendai/AGENT-BOOTSTRAP.md
CONFLICT (content): Merge conflict in docs/delendai/agent-catalog.generated.json
```

Neither is authored. The first carries a block embedded by
`gen:quantitative` — a timestamp and counters that move on every run. The
second is rendered from the proposals on disk, so any proposal that
changes state moves it. Two agents editing unrelated code still collide,
every time, on files whose content is a function of the tree.

The cost is not the resolution; it is what the resolution *blocks*.
`forge:refresh` refuses to refresh a candidate that "does not merge
trivially" — correctly, because a script must not resolve an author's
conflict — so every candidate waits for a human. Measured today: three
open pull requests stale behind the integration branch, one of them 43
commits behind, and a queue that had stopped.

For a derived file, neither side of a merge is authoritative. The merged
TREE is, and the generator is the function from the tree to the file.
Taking a side is a guess; running the generator is the only answer that
is right by construction — and `check:generated` still fails if it ever
disagrees with what landed, so this cannot hide a real divergence.

## non-goals

- **No automatic resolution of authored files.** The table lists only
  files a generator produces. Adding one a person edits would discard
  their work silently, so the bar is "a generator proves its content",
  not "it changes often".
- **No weakening of the generated-artifact gates.** `check:generated`
  and `check:quantitative` keep failing when the committed artifacts
  disagree with the generators.
- **No requirement to configure anything.** A clone without the driver
  merges these files exactly as it does today.

## slices

### S1 — A conflicted generated file is regenerated, not resolved

- **Status**: done — a git merge driver regenerates the file from the
  merged tree and fails loudly when the generator cannot run, leaving the
  conflict for a human rather than guessing a side. `.gitattributes`
  names it; `delendai guard install` configures it per clone, because git
  deliberately never takes a driver command from the repository.
- **Files**: `tools/scripts/git/generated-merge-driver.script.ts`,
  `tools/scripts/git/generated-merge-driver.constant.ts`,
  `tools/scripts/git/generated-merge-driver.interface.ts`,
  `tools/scripts/git/generated-merge-driver.script.spec.ts`,
  `.gitattributes`,
  `packages/cli/src/lib/generated-merge-driver.service.ts`,
  `packages/cli/src/contracts/constants/generated-merge-driver.constant.ts`,
  `packages/cli/src/contracts/interfaces/generated-merge-driver.interface.ts`
- **Gate**: `npx vitest run tools/scripts/git/generated-merge-driver.script.spec.ts`

### S2 — The finished tree gets the last word

- **Status**: done — a merge driver runs per file, mid-merge, on an
  incomplete tree, so what it generates can be subtly wrong (measured: a
  spec count computed from half a merge). A `post-merge` hook re-runs the
  generators against what actually landed and commits only the generated
  paths, without `--no-verify`: where the policy refuses that commit, the
  refusal is the right answer and the report says so.
- **Files**: `packages/cli/src/lib/generated-refresh.service.ts`,
  `packages/cli/src/lib/generated-refresh.service.spec.ts`,
  `packages/cli/src/contracts/constants/generated-refresh.constant.ts`,
  `packages/cli/src/contracts/interfaces/generated-refresh.interface.ts`,
  `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/contracts/constants/guard-hooks.constant.ts`,
  `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`,
  `lefthook.yml`
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`

## acceptance

- Merging a candidate that changed only unrelated code into the
  integration branch produces no conflict in the generated files, and the
  committed artifacts match what the generators produce from the result.
- A generator that cannot run leaves the conflict standing and says so.
- The refresh commits generated paths only; an authored edit dirty in the
  tree at the time is still the author's to commit.
