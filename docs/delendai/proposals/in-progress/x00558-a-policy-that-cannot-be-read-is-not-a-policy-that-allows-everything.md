---
id: x00558
title: "A policy that cannot be read is not a policy that allows everything"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-19
tags:
    - guard
    - startup
    - fail-closed
---

# x00558 — A policy that cannot be read is not a policy that allows everything

## goal

Every place that says "I could not check" stops being treated as "there
was nothing to check". A project that declares a mandatory policy keeps
it enforced when its configuration, its git status or its remote cannot
be read.

## why

Four paths, found by reading the code, where an unknown answer is
silently promoted to a safe one. None of them is visible in a log or a
test result, which is why they survived a green CI.

- **The guard fails open.** `guard.command.ts` catches an error while
  reading the development policy, writes a warning to stderr and returns
  `EXIT_CODE.OK`. A comma in the wrong place in `delendai.config.json`
  therefore turns a project with a mandatory policy into a project with
  no rules — and since x00549 S4 installs the guard automatically, more
  projects now rely on it being in force.
- **`git status` failing reads as a clean tree.** `dirtyPaths()` in
  `git-seam.ts` returns `[]` when `git status --porcelain` fails, and
  `verify-checkout.ts` treats an empty list as a clean tree and proceeds
  to fast-forward the shared checkout. Git has its own protections, so
  this is not automatically destructive — but delendai asserts a
  precondition it did not verify, which is the same mistake in kind that
  x00551 cost five commits to learn.
- **The remote is chosen twice, differently.** The fetch phase uses the
  first remote `git remote` reports; `verify-checkout.ts` looks up
  `refs/remotes/origin/...` explicitly. A project whose remote is called
  `upstream` fetches from one place and judges its currency against
  another.
- **A subcommand lookup reaches the prototype.** The guard resolves
  management subcommands through a plain object indexed by a
  user-supplied string, so `toString` or `constructor` resolve to
  inherited members instead of "unknown command".

## non-goals

- **No mandatory strictness for adopters.** A project that wants the
  permissive behaviour keeps it; what changes is that permissiveness
  becomes a declared choice rather than the accident of a typo.
- **No blocking a repository out of git.** A strict refusal must always
  name the file, the parse error and the way back.

## slices

### S1 — An unreadable policy refuses under a strict enforcement mode

- **Status**: pending
- **Files**: `packages/cli/src/commands/guard.command.ts`,
  `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- The policy declares `enforcement: 'strict' | 'permissive'`. Strict
  refuses the operation when a declared policy cannot be read or
  resolved; permissive keeps today's behaviour. The guard's status
  distinguishes "no policy" from "policy present, unreadable".

### S2 — "Could not check" is a third answer, not a clean tree

- **Status**: done — the git seam answers `clean | dirty | unknown` with
  the underlying reason, and the checkout phase refuses to fast-forward
  on `unknown`, saying so. A seam that does not implement the tri-state
  yet is read as before, so nothing that already worked changed.
- **Files**: `packages/core/src/lib/startup-reconciler/git-seam.ts`,
  `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- `dirtyPaths` answers `clean | dirty | unknown` with the underlying
  error. `unknown` blocks hydration and reports, instead of authorising
  a fast-forward on evidence nobody gathered.

### S3 — One integration remote, resolved once

- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/git-seam.ts`,
  `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- The integration remote is resolved once — from the policy, or from the
  integration branch's upstream — and injected into every phase, with
  the "only `upstream`", "several remotes" and "no remote" cases covered.

### S4 — A lookup by user input cannot reach the prototype

- **Status**: done — subcommand resolution is a `Map`, and `toString`,
  `constructor` and `hasOwnProperty` are answered as unknown hooks.
- **Files**: `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- Subcommand resolution uses a `Map`, and `toString` or `constructor`
  are answered as unknown commands.

## acceptance

- Under strict enforcement, a declared-but-unreadable policy refuses the
  commit and names the parse error; under permissive it warns, as today.
- A failing `git status` blocks hydration and is reported, instead of
  being read as a clean tree.
- A repository whose only remote is `upstream` fetches and judges its
  currency against the same remote.
- `delendai guard toString` is an unknown command.
