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

**Nothing new is written.** `installGeneratedMergeDriver` already exists,
is already correct, and `delendai guard install` already calls it — with
the reason in its own comment: *"the same installer, because a clone that
enforces the policy and still hand-resolves its own generated files is
only half set up (x00559)."*

The gap was that the path which actually **runs** never called it.
`ensureGuardHooks` is what the server invokes at boot and what `prepare`
reaches; it installed the hooks and stopped there. So the driver was
configured only on a machine where somebody had typed
`delendai guard install` by hand.

Two edits, both in the place the behaviour already belonged:

1. `ensureGuardHooks` installs the driver alongside the hooks, and says
   what it did, so a silent install is visible.
2. `prepare` runs `delendai guard install` after the hook installers it
   already runs — because a CI runner and a fresh clone never boot the
   server, and `prepare` is the one thing both of them do.

A first draft of this proposal added a *second* installer under
`tools/scripts/git/`. That was a duplicate of working code, and it is
deleted here rather than kept alongside.

## slices

### S1 — the installer that already exists is actually called

- **Status**: review
- **Files**: [`packages/cli/src/lib/guard-hooks-autoinstall.service.ts`, `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`, `package.json`]
- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`

## acceptance

- `ensureGuardHooks` configures `merge.delendai-generated.driver` as well
  as the hooks, and reports the driver's state in its lines.
- A fresh clone with no driver configured has one after `prepare`.
- The existing autoinstall behaviour is unchanged: 8 prior tests still
  pass.
- No second installer exists.

## risks and mitigations

- **A project that turns the guard off.** `ensureGuardHooks` returns
  early for `absent` and `off` before touching anything, so a project
  that declines the hooks also declines the driver — which is the same
  answer it already gave, and leaves git's default merge in place.
- **The absolute path goes stale.** `installGeneratedMergeDriver` rewrites
  the command each time it runs, and `prepare` runs on every install.
