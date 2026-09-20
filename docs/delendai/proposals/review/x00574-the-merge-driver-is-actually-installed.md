---
id: x00574
title: "The merge driver is actually installed"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - git
    - queue
---

# x00574 — The merge driver is actually installed

## goal

Two candidates that both regenerated a derived file merge cleanly,
everywhere — on a fresh clone, on a CI runner, and in the throwaway
worktrees the refresh uses.

## why

This is the source of the stall that the last several proposals were
each treating a symptom of.

Every candidate in this repository touches `AGENT-BOOTSTRAP.md` and
`agent-catalog.generated.json`, because adding a proposal regenerates
both. So every *pair* of candidates modifies the same two generated
files, and whether that is a conflict or a non-event depends entirely on
one thing: whether git has a merge driver for them.

x00559 built that driver, and declared it in `.gitattributes`:

```
docs/delendai/AGENT-BOOTSTRAP.md            merge=delendai-generated
docs/delendai/agent-catalog.generated.json  merge=delendai-generated
```

`.gitattributes` is tracked. It says which driver to use. **What the
driver *is* lives in `merge.delendai-generated.driver`, in `.git/config`
— which is local, untracked, and was installed by nobody.**

So the declaration was true on exactly one machine: the one where
somebody had configured it by hand. Everywhere else git found no such
driver, fell back to a textual merge of generated output, and produced a
conflict. The evidence is the queue's own log:

```
forge:refresh: 0 refreshed.
forge:refresh: 2 candidate(s) need their author:
  #305 … is 1 behind and does not merge trivially. That is the author's call.
  #299 … is 1 behind and does not merge trivially. That is the author's call.
refresh-candidate-artifacts: 3 candidate(s) behind.
```

Every automatic refresh this cycle added — the post-merge hook, the
candidate artifact refresh, the queue workflow — worked correctly and
then correctly declined, because a conflict *is* the author's call. The
automation was never the problem. It was being handed conflicts that
should never have existed, and a person resolved the same generated-file
conflict by hand over and over.

## non-goals

- Changing the driver. `generated-merge-driver.script.ts` is right.
- Committing fewer generated files. That is a separate trade, and with
  the driver installed it stops being urgent.
- Resolving real conflicts automatically. Only the declared generated
  paths go through the driver; everything else still merges normally and
  a genuine conflict is still the author's call.

## architecture

`install-merge-drivers.script.ts` reads `.gitattributes` for the paths
that name the driver, and configures `merge.delendai-generated.driver`
to the script in *this* checkout. Git resolves `merge.*` from the
**common** config, so one install covers the pinned checkout and every
worktree made from it — which is where the agents actually merge.

It runs from `prepare`, beside `lefthook install` and
`harden-git-hooks`, so a fresh clone and a CI runner both get it from
the install they already do.

`lint:merge-drivers` (chained into `lint:architecture`, which CI runs)
fails when `.gitattributes` routes paths through a driver that is not
configured — because the whole failure mode here was a declaration that
was silently inert.

## slices

### S1 — the declaration installs itself, and is checked

- **Status**: review
- **Files**: [`tools/scripts/git/install-merge-drivers.script.ts`, `tools/scripts/git/install-merge-drivers.constant.ts`, `tools/scripts/git/install-merge-drivers.interface.ts`, `tools/scripts/git/install-merge-drivers.script.spec.ts`, `package.json`]
- **Gate**: `npx vitest run tools/scripts/git/install-merge-drivers.script.spec.ts`

## acceptance

- Two branches that each regenerated the same declared file **conflict**
  without the driver and **merge cleanly** with it, proven against real
  git.
- A repository with no driver configured reports it missing; installing
  is idempotent; a driver pointing at another checkout is replaced.
- A worktree made from the checkout resolves the same driver.
- `lint:merge-drivers` fails when the declaration is inert.

## risks and mitigations

- **The absolute path goes stale.** The installer rewrites a driver that
  points anywhere but this checkout, and `prepare` runs on every install.
- **A generated file is merged wrongly.** The driver regenerates rather
  than merging, so its output is what the generator produces — which is
  the only correct answer for a derived file, and is what `drift` checks
  against anyway.
