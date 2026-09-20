---
id: x00580
title: "A guard never authorises what it did not check"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - guards
    - fail-closed
---

# x00580 — A guard never authorises what it did not check

## goal

A declared policy that cannot be read stops the operation it governs,
instead of waving it through.

## why

`delendai guard <hook>` answered `EXIT_CODE.OK` for two situations it
treated as one:

- the project declares **no** development policy, and
- the project declares one and it **cannot be read**.

The first is an answer. The second is the absence of one, and the
operations this hook guards are exactly the ones the rules exist for:
committing to the integration branch, pushing an unproven publication,
creating a ref outside the namespace. Passing them because the rulebook
is unparseable is the same fail-open shape this cycle has now found three
times — the lefthook resolver that echoed and exited 0, the merge driver
configured with a runtime that cannot start it, and this.

The old reasoning is written in the code: *"say so rather than blocking
every git operation in the repository."* That trades the wrong way round.
A broken `delendai.config.json` is one edit from fixed and the message
names it; an unguarded commit is discovered later, by someone else, from
its consequences.

A test asserted the old behaviour explicitly, which is why no gate ever
objected.

## non-goals

- Refusing when a project declares no policy. That stays a pass.
- Blocking a repository with no escape. `LEFTHOOK=0` still bypasses the
  hook for a genuine emergency, exactly as it did.

## architecture

The `catch` around reading the policy answers `VALIDATION` and says three
things: what could not be read, that nothing was therefore authorised,
and the two ways out — fix the file, or remove the `development` block if
the project genuinely has no policy.

`policy === undefined` keeps its `OK`.

## slices

### S1 — an unreadable policy refuses, a missing one passes

- **Status**: review
- **Files**: [`packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/guard.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`

## acceptance

- A policy read that throws refuses the hook.
- A project that declares no policy still passes.
- The existing guard behaviour is otherwise unchanged: 13 prior tests
  still pass.

## risks and mitigations

- **A malformed config blocks work.** It blocks *guarded* operations, and
  names the file and the fix in the refusal. The alternative is that the
  same malformed config silently disables every rule the project has.
