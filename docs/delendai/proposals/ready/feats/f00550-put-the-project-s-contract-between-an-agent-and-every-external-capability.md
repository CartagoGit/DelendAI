---
id: f00550
title: "Put the project's contract between an agent and every external capability"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-16
tags:
    - external-mcps
    - capabilities
    - design
    - verification
---

# f00550 — Put the project's contract between an agent and every external capability

## goal

When an agent uses an external capability — a design source, a browser,
a database — delendai supplies the project's contract first, normalises
what comes back, and checks the result against the project, instead of
letting each external server decide how this codebase should be written.

## why

`external-mcps` (f00193) already composes third-party MCP servers as a
control plane: `catalog`, `discover`, `suggest`, `ack`, `status`,
`validate_config` and a `call` invoke proxy, with mandatory version
pins, env var NAMES only, three autonomy knobs defaulting to the
resolved security posture, a durable pending-ack ledger, a calls budget,
and a token-lean mandate that contributes no system-prompt bytes.

What it does not do is carry the PROJECT into the call. A design server
knows its own design format; a browser server knows the browser; a
database server knows SQL. None of them knows that this project uses
external templates, names its colours as design tokens, already has a
`ButtonComponent`, and forbids arbitrary values. So an agent takes a
perfectly good external answer and writes code that fights the codebase.

The pieces to carry are the ones the other three proposals produce:
f00547 resolves what the framework version allows, f00548 owns
the style surface and its design tokens, f00549 says where files
belong and what may import what. This proposal is where they are spent.

## non-goals

- **Not a design-tool plugin.** The gateway normalises CAPABILITIES —
  read a design, inspect a page, capture a screenshot — not products. A
  design provider is the first adapter, not the architecture.
- **Not a new security model.** The activation, ack and budget flow
  `external-mcps` already enforces stays exactly as it is; this adds the
  project contract to the calls that flow already permits.
- **Not automatic code generation from a design.** The gateway supplies
  context and verifies results; writing the code stays the agent's job.

## slices

### S1 — Capability names, and which effects they carry

- **Status**: pending
- **Files**: [`plugins/external-mcps/src/lib/capability/capability-registry.ts`, `plugins/external-mcps/src/lib/capability/capability-registry.spec.ts`, `plugins/external-mcps/src/lib/contracts/interfaces/capability.interface.ts`]

Name capabilities rather than products — `design.read`, `design.tokens`,
`browser.inspect`, `browser.screenshot`, `database.query` — and classify
each with core's existing effect vocabulary (`write`, `spawn`,
`network`, `destructive`), so a destructive external call is gated by
the machinery the dry-run protocol already keys off rather than a new
one invented here.

- **Gate**: `npx vitest run plugins/external-mcps/tests/src/lib/capability/capability-registry.spec.ts`

### S2 — The effective project contract, as one small payload

- **Status**: pending
- **Files**: [`plugins/external-mcps/src/lib/contract/project-contract.ts`, `plugins/external-mcps/src/lib/contract/project-contract.spec.ts`]

Assemble what the project requires — resolved framework and version,
style architecture, design-token policy, placement rules, existing
components — from f00547, f00548 and f00549, each optional.
A host that loads none of them still gets a valid, smaller contract,
because the gateway must not hard-depend on three unshipped plugins.

- **Gate**: `npx vitest run plugins/external-mcps/tests/src/lib/contract/project-contract.spec.ts`

### S3 — Normalise the answer, and keep a handle to the raw one

- **Status**: pending
- **Files**: [`plugins/external-mcps/src/lib/normalize/normalize-response.ts`, `plugins/external-mcps/src/lib/normalize/normalize-response.spec.ts`]

A large external payload becomes the small normalised facts the agent
needs, with the raw artifact kept behind a handle for the rare case that
needs it. This is the same summary/evidence split f00547 uses, for
the same token reason.

- **Gate**: `npx vitest run plugins/external-mcps/tests/src/lib/normalize/normalize-response.spec.ts`

### S4 — Prefer what already exists over what was just described

- **Status**: pending
- **Files**: [`plugins/external-mcps/src/lib/reuse/match-existing.ts`, `plugins/external-mcps/src/lib/reuse/match-existing.spec.ts`]

Before an external description becomes a new component, match it against
the components the project already has and report the candidates with
their similarity, so "add a third button" is a decision someone makes
rather than a default.

- **Gate**: `npx vitest run plugins/external-mcps/tests/src/lib/reuse/match-existing.spec.ts`

### S5 — Verify the result against the project, not against the source

- **Status**: pending
- **Files**: [`plugins/external-mcps/src/lib/verify/verify-against-contract.ts`, `plugins/external-mcps/src/lib/verify/verify-against-contract.spec.ts`]

After the work, check what was produced against the same contract that
went in: placement, style ownership, design tokens instead of literals,
and framework-version legality. A conflict between the external source
and the project resolves to the project, with the conflict named.

- **Gate**: `npx vitest run plugins/external-mcps/tests/src/lib/verify/verify-against-contract.spec.ts`

## acceptance

- A capability call carries the effective project contract, and a host
  with none of the three contributor plugins still gets a valid one.
- A destructive external capability is gated by the same effect and ack
  machinery as any other destructive effect; no new bypass exists.
- An external description that matches an existing component reports the
  match instead of proposing a new file.
- Verification reports a project-versus-source conflict as resolved to
  the project, naming what was overridden.

## notes

- Ordering: this is the last of the four. f00547 first as shared
  infrastructure, then f00548 and f00549 which consume it, then
  this, which spends all three.
- The token-lean mandate of `external-mcps` applies here too: a session
  that never calls an external capability must pay nothing for this.
