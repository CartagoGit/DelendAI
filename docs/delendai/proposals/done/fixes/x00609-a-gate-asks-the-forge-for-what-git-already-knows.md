---
id: x00609
title: "A gate asks the forge for what git already knows"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["1de88bd51"]
---

# x00609 — A gate asks the forge for what git already knows

## goal

`ref-lifecycle` decided whether a work ref had been published by asking
the forge to compare two commits — once per work ref, per container. On a
repository carrying eighty unpublished work refs that is hundreds of API
calls in one job, and when the forge's secondary rate limit answered
instead, the job died with an unhandled `Command failed`. Containment is a
fact about commits; it must be read from the commits.

## why

Observed on two open pull requests at the same time, neither of which had
anything wrong with it:

```
error: Command failed: gh api repos/.../compare/1de88bd5...4057424d --jq .status
    at genericNodeError (node:child_process:1081:13)
error: script "lint:ref-lifecycle" exited with code 1
```

A required check, red on everything, with a node stack trace for a cause.
Re-running it made it pass or fail depending on nothing the pull request
controlled. Three separate costs:

- **The wrong source.** "Does `base` contain `head`" is answered by
  `git merge-base --is-ancestor` with no network at all. The forge was
  asked for a local fact.
- **The wrong shape of failure.** An unhandled `execFileSync` throw reads
  as a defect in the gate's code. A rate limit is not that, and nobody can
  act on a stack trace.
- **The wrong scale.** The call count grows with the number of unpublished
  work refs — which is exactly the number a busy swarm keeps high, so the
  gate got less reliable the more the repository was used.

## why this design

Git is asked first and the forge only when this clone genuinely cannot
tell — a shallow checkout, a ref never fetched. That ordering matters more
than the saving: git's answer is authoritative and free, and the forge's
is neither.

`undefined` is a third answer and is kept as one. Reading "git could not
tell" as "no" would report an unpublished ref as published, or the
reverse, which is the fail-open shape x00558 exists to stop; exit code 1
is git *saying* no, and anything else is git failing to answer.

When neither source can answer, the throw now names the two refs it could
not compare. A gate that cannot check must say what it could not check —
it must not pass, and it must not read as a code defect either.

## non-goals

- Changing which refs the guard judges, or `reconcileRefs`, which stays
  the one classifier.
- Reducing the other forge calls (branches, pull requests): those are one
  paginated call each and do not grow per ref.

## Slices

- global_gate: none

### S1 — Containment is read from the commits

- **Status**: done — `containedInGit` answers from
  `git merge-base --is-ancestor`, returning `undefined` when this clone
  cannot tell; `containsWith` prefers it and falls back to the forge only
  then, naming both refs if neither can answer. Measured against the real
  forge afterwards: **139 refs judged in 9 seconds, exit 0**, where the
  same gate had been failing on the rate limit. Nine tests cover every
  branch, including the one that matters most — git exiting 128 must read
  as "cannot tell", never as "no".
- **Gate**: `npx vitest run tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Files**: `tools/scripts/lint/ref-lifecycle-guard.script.ts`,
  `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`

## acceptance

- The guard judges every ref in this repository with no `compare` call at
  all while the clone has the commits, and exits 0.
- A clone that cannot answer still gets a verdict, from the forge.
- Neither answering produces a message naming the two refs, not a stack
  trace.
