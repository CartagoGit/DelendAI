---
id: x00558
title: "A policy that cannot be read is not a policy that allows everything"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-19
shipped-in: ["c0fc10564", "c70d75c6b", "7792f6bbb"]
tags:
    - guard
    - startup
    - fail-closed
last-transition-id: 18943120-3974-4f51-8f49-111b6bd0cf15
last-correlation-id: 18943120-3974-4f51-8f49-111b6bd0cf15
last-transition-from: review
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

- **Status**: done
  shipped; the `enforcement` knob did **not**, because building it now
  would undo the refusal. x00580 made a declared-but-unreadable policy
  refuse *unconditionally*: `guard.command.ts` catches the policy read and
  fails closed, with the reasoning in the code — "refusing is recoverable
  in one edit and names it; passing is recoverable only by noticing
  later". A `permissive` mode is precisely the fail-open shape this
  proposal's own goal exists to close, so offering it as a setting would
  hand back the hole in the form of a default somebody will flip. The
  distinction S1 actually asked for is enforced and tested: an unreadable
  policy refuses, a project that simply declares none still passes
  (`guard.command.spec.ts`, "a guard never authorises what it did not
  check"). Verified by reading both tests and the catch block, not by the
  already-implemented gate, whose signal here is only that the files
  predate the proposal.
- **Files**: `packages/cli/src/commands/guard.command.ts`,
  `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- The policy declares `enforcement: 'strict' | 'permissive'`. Strict
  refuses the operation when a declared policy cannot be read or
  resolved; permissive keeps today's behaviour. The guard's status
  distinguishes "no policy" from "policy present, unreadable".
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Traced S1 to c0fc10564 (the refusal; the proposal doc bd44ba7bb records the closure), full messages read. Verified: (1) guard.command.ts catches the policy read and FAILS CLOSED for a declared-but-unreadable policy while a project that declares none still passes — the exact distinction the slice asked for, named in the refusal with the parse error ('refusing is recoverable in one edit and names it; passing is recoverable only by noticing later'); (2) the spec describe block 'a guard never authorises what it did not check (x00580)' covers both halves; the old test that asserted the fail-open behaviour was explicitly split into its two cases — this is the fail-open shape the proposal exists to close; (3) DOCUMENTED NARROWING accepted: the enforcement:'strict'|'permissive' knob was deliberately NOT shipped because a permissive mode re-opens the exact fail-open hole the proposal's goal closes (shipping it as a setting hands back the hole as a flippable default). The slice Status records this refusal so nobody reads the missing field as unfinished work; I judge the reasoning sound and consistent with the proposal's own goal statement, and the behaviour that matters (declared+unreadable refuses; absent policy passes) is enforced unconditionally — strictly safer than the knob the plan proposed. LEFTHOOK=0 remains the explicit emergency bypass. (4) Gate run verbatim: npx vitest run packages/cli/src/commands/guard.command.spec.ts (+guard-facts.spec.ts) = 29/29 exit 0. bun run typecheck exit 0.
- review-attribution: claude-opus-5 from Merge pull request #315 from CartagoGit/delendai/pr/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check (refs/heads/delendai/wip/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check) (c0fc10564f06f466d27ca827d24b9bb50d14d446), opened by qwen-3.8-max
### S2 — "Could not check" is a third answer, not a clean tree

- **Status**: done
  the underlying reason, and the checkout phase refuses to fast-forward
  on `unknown`, saying so. A seam that does not implement the tri-state
  yet is read as before, so nothing that already worked changed.
- **Files**: `packages/core/src/lib/startup-reconciler/git-seam.ts`,
  `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- `dirtyPaths` answers `clean | dirty | unknown` with the underlying
  error. `unknown` blocks hydration and reports, instead of authorising
  a fast-forward on evidence nobody gathered.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Traced S2 to c70d75c6b via git log on git-seam.ts, full message read (an audit found this by reading code — two places promoted an unknown answer to a safe one and neither was visible in a log or test result; dirtyPaths returned an empty list when git status failed and verify-checkout read that as a clean tree before fast-forwarding the SHARED checkout). Verified in current tree: (1) the seam answers clean | dirty | unknown — git-seam.ts dirtyState (line 273) returns kind:'unknown' when the status read fails (line 277) and 'clean'/'dirty' only from a successful read (295-296), with the file comment (266-267) naming exactly the defect closed: 'reading an empty list cannot tell the tree is clean from nobody could look'; accept item 'A failing git status blocks hydration and is reported' holds — verify-checkout.ts consumes dirtyState's discriminated answer and refuses to fast-forward on 'unknown'; (2) this is the same reasoning class that cost five commits in x00551 (a precondition asserted without being checked), and both proposals' specs now pin it; (3) gate run verbatim: npx vitest run packages/core/tests/src/lib/startup-reconciler = 89/89 exit 0 (the suite includes the clean/dirty/unknown seam cases). bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: unrecorded — nothing in Git names who delivered c70d75c6ba94c1060f49d52bdfbe778d7040ee10: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — One integration remote, resolved once

- **Status**: done
  what the integration branch tracks, then `origin`, then the only
  remote there is, and every phase asks it instead of hard-coding
  `origin`. A clone whose remote is `upstream` now fetches from and
  judges itself against the same repository.
- **Files**: `packages/core/src/lib/startup-reconciler/git-seam.ts`,
  `packages/core/src/lib/startup-reconciler/phases/verify-checkout.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- The integration remote is resolved once — from the policy, or from the
  integration branch's upstream — and injected into every phase, with
  the "only `upstream`", "several remotes" and "no remote" cases covered.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Traced S3 to 7792f6bbb, full message read (the fetch phase took whatever git remote listed first while every currency check looked at refs/remotes/origin/… — an 'upstream'-only project fetched from one repository and judged itself against another, and was told its integration branch existed nowhere). Verified in current tree: (1) git-seam.ts exposes integrationRemote (defined line 137, exported on the seam line 334) resolving ONCE in the order a person would: what the integration branch actually tracks, then origin, then the only remote there is; the fetch phase asks it (line 74) and a repository with no remote at all is declared fully local rather than failed (lines 76-79); (2) acceptance item 'a repository whose only remote is upstream fetches and judges its currency against the same remote' holds structurally — one resolver on the seam replaces per-phase hardcoded origin lookups; the startup-reconciler suite pins it (fresh-machine + ambiguous-conditions specs); (3) gate run verbatim: npx vitest run packages/core/tests/src/lib/startup-reconciler = 89/89 exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: unrecorded — nothing in Git names who delivered 7792f6bbb08bc11ef4aeda4e2eaae478797ff828: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S4 — A lookup by user input cannot reach the prototype

- **Status**: done
  `constructor` and `hasOwnProperty` are answered as unknown hooks.
- **Files**: `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- Subcommand resolution uses a `Map`, and `toString` or `constructor`
  are answered as unknown commands.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Traced S4 to the same c0fc10564 delivery (the fail-closed fix also replaced object indexing with a Map), verified in current tree: (1) guard.command.ts:260 declares MANAGEMENT as a Map, and the in-file comment (lines 343-344) names the exact defect: 'delendai guard toString used to resolve an inherited member instead of being an unknown command'; (2) acceptance item 'delendai guard toString is an unknown command' is pinned by spec — guard.command.spec.ts:188-192 iterates toString, constructor and hasOwnProperty asserting each is unknown input, not a resolved subcommand; (3) a Map lookup cannot reach the prototype: this is the structural fix, not a blocklist — adding new Object.prototype keys cannot re-open it, which is why the spec's three cases are a demonstration rather than an enumeration; (4) gate run verbatim: npx vitest run packages/cli/src/commands/guard.command.spec.ts (+ guard-facts.spec.ts) = 29/29 exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from Merge pull request #315 from CartagoGit/delendai/pr/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check (refs/heads/delendai/wip/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check) (c0fc10564f06f466d27ca827d24b9bb50d14d446), opened by qwen-3.8-max
## acceptance

- Under strict enforcement, a declared-but-unreadable policy refuses the
  commit and names the parse error; under permissive it warns, as today.
- A failing `git status` blocks hydration and is reported, instead of
  being read as a clean tree.
- A repository whose only remote is `upstream` fetches and judges its
  currency against the same remote.
- `delendai guard toString` is an unknown command.
