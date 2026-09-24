---
id: x00623
title: "A write declares which tree it belongs to"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-23
---

# x00623 — A write declares which tree it belongs to

## goal

Every tool that writes declares *where* its writes belong. The server
resolves that place per request from one resolver, instead of each tool
reaching for the root the server was started with. A write can then land
in the wrong tree only if someone declared it wrong in one place.

## why

x00608 found this in two proposal tools. An agent in its own worktree
called `proposal_transition`, got `ok`, and the rename happened in the
shared checkout on the integration branch. x00608 fixed those two tools
and added `callerCheckout`, one resolver that proves a path is a working
tree of this repository (shared git common directory) and moves a
tool's paths with it.

The class is wider than two tools. `develop` at `d43f019df` has 74 tool
registrations with a `write` effect, across 14 packages (proposals 18,
core 8, commit-policy 5, issues 3, forge 3, and others). Every one
resolves its paths from the composition root, and nothing records which
of four different places the author meant:

| Root | Meaning | Example |
| --- | --- | --- |
| `caller-checkout` | the working tree the calling agent is in | a proposal rename, a generated file |
| `repository` | a fact about the whole repository, the same from every worktree | the proposal id counter, the agent lock |
| `host-state` | state outside any working tree | caches, the SQLite projection, journals |
| `server` | the server's own root, deliberately | its own configuration |

The difference matters exactly when an agent works in a worktree, which
is the model this project recommends. A counter rooted per worktree
hands out the same id twice; a rename rooted at the server lands on the
integration branch. Today the distinction lives in the heads of
whoever wrote each tool. It belongs in a declaration.

This is the order the external review asked new invariants to follow:
a type the author has to fill in first, then runtime resolution, and
only then a check for the ones that are missing.

## why this design

- `IToolEffect` already says *that* a tool writes. A `writeRoot` beside
  it says *where*, in the same registration, where reviewers already
  look. It is not optional for a `write` tool, because an omitted root is
  the current bug.
- Resolution goes through `callerCheckout`, so there is still one
  definition of "a working tree of this repository". `repository` resolves
  through `sharedCheckout`, the existing answer for facts shared by all
  worktrees.
- The request argument stays `callerCheckout.arg`, one spelling across
  the catalog. Only `caller-checkout` tools declare it, so read-only
  tools and host-state tools pay nothing in schema bytes.

## non-goals

- Changing what any tool writes.
- Letting a request move a `repository` or `host-state` write. Those
  roots are not the caller's to choose.

## Slices

- global_gate: none

### S1 — The registration declares a write root

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/write-root.spec.ts`
- **Files**: `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`,
  `packages/core/src/lib/shared/shared-checkout.ts`,
  `packages/core/tests/src/lib/shared/write-root.spec.ts`
- `IToolWriteRoot = 'caller-checkout' | 'repository' | 'host-state' |
  'server'`, and `writeRoot` on the registration. One resolver takes the
  root, the server's root and the request, and returns the directory to
  write in, refusing a caller checkout that is not a working tree of this
  repository. A spec covers each root, including from a linked worktree.
- Published as `callerCheckout.writeRoot`, inside the existing facade,
  so the public surface does not grow; `IToolWriteRoot` is reachable as
  `IToolRegistration['writeRoot']`.

### S2 — The proposal tools declare their roots

- **Status**: pending
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools`
- **Files**: `plugins/proposals/src/lib/tools/*.tool.ts` — the literal list
  is recorded when the slice ships
- The 18 write tools of the heaviest plugin declare their roots.
  `proposal_transition` and `create_proposal` move from their x00608
  special case to the shared resolver, with behaviour unchanged.

### S3 — Every other write tool declares its root

- **Status**: pending
- **Gate**: `bun run lint:architecture`
- **Files**: the remaining write registrations — the literal list is
  recorded when the slice ships
- Core, commit-policy, issues, forge, memory, git, deps and the rest
  declare theirs, each justified in one line where it is not obvious.

### S4 — A write tool without a root does not register

- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/tools`
- **Files**: `packages/core/src/lib/project/create-mcp-project.ts`
- A registration with a `write` effect and no `writeRoot` is refused when
  the registration sequence is planned (`planRegistrationOrder`). That makes this a type-and-runtime
  invariant, not a new textual lint.

## acceptance

- Every `write` registration declares a root. A missing one fails at
  registration, not in review.
- From a linked worktree, a `caller-checkout` write lands in that
  worktree, a `repository` write lands in the shared checkout's
  repository state, and neither touches the integration branch's
  working tree.
- The catalog grows by the `checkout` argument only on
  `caller-checkout` tools.
