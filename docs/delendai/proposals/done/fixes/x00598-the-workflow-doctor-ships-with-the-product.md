---
id: x00598
title: "The workflow doctor ships with the product"
kind: fix
status: review
type: proposal
track: swarm
date: 2026-09-22
tags:
    - work-refs
    - adoption
---

# x00598 — The workflow doctor ships with the product

## goal

A project can ask whether the work-ref model is holding, and is told
when it is not.

## why

The checks exist. `checkWorkflowInvariants` states seven promises the
work-ref model makes, each with its evidence and its remedy, and it is
good: it is the difference between "something is wrong with the git
graph" and "`checkout-clean` is broken, three paths, here is the
command".

Two things made it useless anyway.

**It lived in this repository's toolbox.** `tools/scripts/git/`,
reachable as `bun run work:doctor` from a clone of delendai itself.
Every *other* project — the ones the work-ref model is actually for —
had the model and no way to ask whether it was holding. A detector that
ships with the thing it detects is dogfooding; one that stays behind in
the toolbox is a private diagnostic.

**Nobody ran it.** That is not a criticism of anyone: a check you have
to remember to run is a check that gets run after the damage, if at all.
Every one of the last dozen breakages in this project was found by a
person noticing something in a git graph, hours later, starting the
diagnosis from scratch.

## non-goals

- Repairing. A checker that also repairs cannot be run to find out
  whether repair was needed. It stays read-only, and x00591's guarantee
  — starting a server does not edit your repository — is unaffected.
- Reciting. A server that reports its own health on every start is a
  server whose output gets ignored.

## architecture

The invariants move to `packages/cli/src/lib/workflow-invariants.service.ts`
and reach every project as `delendai work doctor [--forge]`.
`workflow-doctor.service.ts` holds the part that was buried in the
script's `import.meta.main`: which root to judge from, and which policy
to judge against.

`--git-common-dir` is what resolves the root, because `--show-toplevel`
answers the worktree the caller is standing in and the invariants are
about the pinned checkout. That is what makes `doctor` tell the truth
when an agent runs it from inside its own worktree.

`tools/scripts/git/check-workflow-invariants.script.ts` becomes a
six-line wrapper, so `bun run work:doctor` and the CI script that
depends on it keep working.

**Boot reports only what does not hold.** The invariants that are kept
are not news. The broken ones are printed on stderr with their remedy,
once, at the moment somebody opens the project — which is the only
moment they are reliably looking.

## slices

### S1 — the invariants ship, and boot names the broken ones

- **Status**: review
- **Files**: [`packages/cli/src/lib/workflow-invariants.service.ts`, `packages/cli/src/lib/workflow-invariants.service.spec.ts`, `packages/cli/src/lib/workflow-doctor.service.ts`, `packages/cli/src/contracts/interfaces/workflow-invariants.interface.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`, `tools/scripts/git/check-workflow-invariants.script.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/workflow-invariants.service.spec.ts packages/cli/src/index.spec.ts`

## acceptance

- `delendai work doctor` runs in a project that is not delendai and
  reports all seven invariants with their evidence; `--forge` narrows to
  the shared ones; `--json` returns the report.
- It exits non-zero when an invariant is broken.
- `bun run work:doctor` behaves as it did.
- Booting into a project carrying a modification reports
  `checkout-clean` on stderr **and the six invariants that hold are not
  mentioned**.
- Booting changes nothing: the modification the project was carrying is
  still exactly as its author left it.

## risks and mitigations

- **Noise on every start of a project that is mid-work.** Only broken
  invariants print, and `checkout-clean` being broken during work is the
  case the operator most wants named — it is how another agent's changes
  end up in somebody's commit.

## notes

Driving `work doctor` through the real CLI against a fresh project
immediately found something true and unrelated: a clean, untouched
project reports `checkout-clean` broken with `?? .cache/` and
`?? .delendai/` — directories delendai itself creates on boot. x00596
makes `.delendai/` hide itself; the cache directory needs the same
treatment, and does not have it yet. The doctor found it the first time
it was pointed at a project that was not this one, which is the argument
for shipping it.
