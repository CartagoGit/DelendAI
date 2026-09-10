---
id: devstrat-2026-09-10
title: 'Development strategies: why shared-checkout-pr is the default'
---

# Development strategies

This is the canonical explanation of how work reaches the integration
branch in DelendAI, and why the default is what it is. It explains the
model; it does not restate its parameters.

**Where the values live.** Branch names, required checks, approval
counts and every other knob are resolved from the `development` block of
`delendai.config.json` and projected into the committed governance files
by `bun tools/scripts/governance/forge-settings.script.ts`. Read those
for current values. Nothing here repeats them, because a document that
copies a knob becomes the next place it drifts — see
[ADR 0020](./adr/0020-branch-model-develop-integrates-through-pull-requests.md)
and the ADR it supersedes.

## The principle

> Share physical infrastructure where it helps; isolate and make
> explicit the logical mutations.

That sentence is the whole design, and it is not specific to git. The
same shape governs the state database, proposals, leases, artefacts and
handoffs: one shared substrate, with ownership, identity and bounded
mutation layered on top. `shared-checkout-pr` is that principle applied
to a working tree.

## The two strategies

The development policy is a set of orthogonal axes, not a mode enum. Two
combinations are named as profiles:

```
shared-checkout-pr    ← DEFAULT
    one working tree, shared
    private git index per operation
    staging limited to claimed paths
    HEAD is stable
    integration by pull request

worktree-pr           ← ALTERNATIVE
    one working tree per agent
    physical checkout isolation
    integration by pull request
```

They share the higher-level coordination model — claims, leases,
pull-request integration. They differ only in how the working tree is
isolated.

`worktree-pr` is not deprecated, not a fallback, and not a later
evolution. It is the right choice when a consumer needs physical
isolation, and selecting it is a configuration change rather than a
migration.

## Why sharing the checkout is safe here

The isolation does **not** come from each agent having its own checkout.
It comes from virtualising the mutable git state that actually produces
a commit:

- **A private index.** Every git invocation in the WIP engine runs with
  `GIT_INDEX_FILE` pointed at a throwaway file. The repository's
  `.git/index` — the one the operator's editor and every other agent
  share — is never opened for writing.
- **Staging by claimed path.** The engine stages named paths with
  `update-index`. There is no path through it that stages the worktree.
- **A stable HEAD.** Checkpoints are built with `commit-tree` and
  published with `update-ref` onto a ref under `refs/wip/`. HEAD does
  not move, so no agent pulls the branch out from under another.
- **Scope recorded on the commit.** The claimed paths travel as trailers
  on the checkpoint itself, so a later reader can tell what a checkpoint
  was allowed to contain without consulting a side table that could
  disagree.

A shared working tree is therefore not "several agents using the same
checkout and being careful". The mutations that matter are bounded
before they reach anything shared.

## Why this is the default

- **Cost.** A checkout per agent multiplies disk, and multiplies the
  setup and teardown an ephemeral agent pays before it does any work.
- **Sharing what is safe to share.** Dependencies, caches and build
  materialisations are expensive and identical; duplicating them per
  agent buys nothing.
- **Ownership stays explicit.** Physical isolation makes the ownership
  question disappear rather than answering it. Claims answer it, and the
  answer is legible: an agent declares what it owns and the engine
  enforces it.
- **The mechanism generalises.** Git worktrees isolate a working tree
  and nothing else. The state database, proposals, leases, artefacts,
  context and handoffs all need the same ownership-and-bounded-mutation
  treatment, and none of them have a worktree equivalent. Solving it
  once, in a form that applies to all of them, is worth more than
  solving it for git alone.
- **It is a default, not a constraint.** A consumer whose repository or
  toolchain needs physical isolation selects `worktree-pr`. The point of
  orthogonal axes is that an operational preference never becomes an
  architectural truth.

## What sharing a checkout still costs

A shared working tree has shared surfaces that the private index does
not cover, and pretending otherwise would be the wrong kind of
documentation:

- **The filesystem itself.** Two agents editing genuinely overlapping
  paths is a claim conflict, not a git problem, and it is resolved by
  claims rather than by the engine.
- **Generated output.** A tool that writes build artefacts, caches or
  code generation output can touch paths nobody claimed. The engine will
  not commit them — they are outside the scope — but they are still
  present in the tree for everyone.
- **External commands.** Anything that shells out to git without
  inheriting the WIP environment operates on the shared index and the
  shared HEAD. So does any tool that assumes the whole working tree
  belongs to it.
- **Renames and deletes across claims.** A rename whose source and
  destination fall under different claims spans two owners; the
  checkpoint captures only what its own scope covers.

These are the reason the model rests on mechanical invariants rather
than on asking agents to be careful.

## How the invariants are enforced

Behaviour is covered by specs — a foreign dirty file never enters a
checkpoint, `.git/index` is byte-identical afterwards, HEAD and the
current branch are unchanged, a narrowed scope is refused rather than
silently dropping work.

Mechanism is covered by `lint:exact-scope-checkpoint`, and that
distinction matters. A behavioural test can only fail once the mistake
has been made. The lint fails on the diff that introduces it:

- The engine may not stage globally, in any spelling.
- The engine may not invoke porcelain that mutates state it does not
  own — the commands that move the shared HEAD, rewrite the shared
  index, or delete files outside the claim are refused by name, each
  with the reason it cannot be scoped.
- The engine's git runner must still set `GIT_INDEX_FILE`; dropping it
  is a violation rather than a silent regression.

## Where to look next

- [ADR 0020](./adr/0020-branch-model-develop-integrates-through-pull-requests.md)
  — the decision that integration happens through pull requests, and
  why.
- `delendai.config.json`, `development` block — the resolved policy and
  every operational value.
- `packages/core/src/lib/wip-engine/` — the checkpoint engine.
- `tools/scripts/lint/exact-scope-checkpoint.script.ts` — the guard that
  keeps the mechanism in place.
