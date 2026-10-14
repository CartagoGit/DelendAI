---
id: f00758
title: "Identity policy: declare how agents are named in delendai.config.json"
kind: feat
status: review
type: proposal
track: general
date: 2026-10-12
last-transition-id: 907a3a7c-523c-4f08-9e6d-f8746e3528e9
last-correlation-id: 907a3a7c-523c-4f08-9e6d-f8746e3528e9
last-transition-from: in-progress
last-transition-at: 2026-10-12T16:15:07.165Z
---

# f00758 — Identity policy: declare how agents are named in delendai.config.json

## goal

Let a project declare its identity model in development.identity instead of inheriting the hardcoded chain: refuse or rename identities that are not a declared/recognised model id, and opt out of provider-bridge naming.

## why

PR #1037 added the provider bridge as an identity source, but whether a bridge-observed name counts is not a project decision: a project that wants only declared model ids, or that wants identities nothing named a model mapped to one default, has no way to say so. Identity is load-bearing — it names work refs, commit authors and review attribution — so its rules belong in the policy the project declares, next to guard.unknownActor.

## why this design

The policy already carries one axis about naming actors: `guard.unknownActor`
(`resolve-guard.ts` + `policy-guard.interface.ts` + a validate rule + a
regenerated schema entry). This proposal adds a sibling axis with the same
shape — a declared value is stored, an absent key keeps today's behaviour, an
unrecognised value is carried through so `validateDevelopmentPolicy` names it
back to the operator. Enforcement lives where identity is resolved
(`agentFor`, `agentArg`, `workRefAgent`), so one axis with three readers,
not three parallel rules.

## non-goals

- Changing what a project that declares nothing gets: the chain model -> environment -> provider -> client stays the default.
- Validating model ids against a vendor registry — 'unrecognised' here means 'not a declared model identity', not 'not a model this vendor sells': `unrecognizedModel` classifies HOW an identity arrived (declared vs observed vs nothing).
- Touching the roster (coordination.roster), which already decides WHO may work; this axis decides HOW a name counts.

## architecture

```jsonc
"development": {
  "identity": {
    // default true: accept the observed model from the provider bridge
    "providerBridge": true,
    // default "refuse": what to do with an identity no source named a
    // model (bridge off, or nothing declared at all)
    //   "refuse"      — keep refusing, naming this axis as the reason
    //   { "use": "x" } — name it `x` (normalised) instead
    "unrecognizedModel": "refuse"
  }
}
```

Resolved into `IPolicyIdentity` next to `IPolicyGuard`; validate rule
`identity.unrecognizedModel` / `identity.providerBridge`; enforced in:

1. `agentFor(args, workspace)` — reads the axis from the resolved policy of
   the workspace it is entering (already opens the policy).
2. CLI `agentArg` / `unnamedAgentNotice` — the boot notice says what the
   policy will do instead of promising a model name.
3. commit-policy `workRefAgent` / `workRefAgentDeclared` — the same axis
   passed through `IWorkRefAgentSources`.

## slices

- global_gate: `bun run typecheck`

### S1 — policy axis: resolve, validate, schema
- **Status**: done (6c5f278fb)
- **Files**: `packages/core/src/lib/contracts/interfaces/policy-identity.interface.ts`, `packages/core/src/lib/development-policy/resolve-identity.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/src/lib/development-policy/policy-identity.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/development-policy`
- shipped-in: `1ee6c5c4bd1f`

### S2 — enforcement in the work engine
- **Status**: done (3018a57d4)
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/work-units packages/core/tests/src/lib/work-identity`
- shipped-in: `3018a57d4357`

### S3 — enforcement in the CLI and commit-policy; docs
- **Status**: done (1ee6c5c4b)
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/commands/groups/group-helpers.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/work-ref-naming.interface.ts`, `plugins/commit-policy/src/lib/services/work-ref-naming.service.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/tests/src/lib/services/work-ref-naming.service.spec.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: `npx vitest run --project @delendai/cli && npx vitest run --project commit-policy plugins/commit-policy/tests/src/lib/services/work-ref-naming.service.spec.ts && bun run lint:prompt-size`
- shipped-in: `1ee6c5c4bd1f`

## dependency graph

S1 -> S2 -> S3 (each slice consumes the previous one's axis; no disjointness).

## acceptance

- A project with no `development.identity` key behaves exactly as after PR
  #1037 (chain: model -> environment -> provider -> client); the axis is
  inert until declared.
- `development.identity.providerBridge: false` makes a bridge-only identity
  resolve to nothing, and the refusal names the axis and its remedy
  (declare `DELENDAI_AGENT_ID`, or allow the bridge).
- `development.identity.unrecognizedModel: { use: "shared-agent" }` names
  every identity no source declared a model as `shared-agent`, so a project
  that does not care WHICH model works still gets refs and commit authors
  it can read.
- `development.identity.unrecognizedModel: "refuse"` (the default) keeps
  today's refusal, but the message names the new axis so an operator knows
  the knob exists.
- An unrecognised `unrecognizedModel` word (e.g. `"whatever"`) is carried
  through resolution (the schema takes any non-empty string) and reported by
  `validateDevelopmentPolicy` with path `identity.unrecognizedModel`, like
  every strategy axis. A non-boolean `providerBridge` is rejected one level
  earlier by the config schema, which names the same path.
- The regenerated `delendai.config.schema.json` accepts the block and
  rejects unknown keys inside it (`additionalProperties: false`).
- `agentFor`, CLI `agentArg` and commit-policy `workRefAgent` all read the
  SAME axis — one policy, three consumers — with a spec per consumer.
- All of it lands on `develop` through one pull request, CI green.

## risks and mitigations

- **Byte budget**: AGENT-BOOTSTRAP.md is at 31997/32000B. The docs slice
  must reword existing lines, not just add; the served instruction
  (`AGENT_IDENTITY_INSTRUCTION`) may also need a one-line mention. Accepted:
  the knob is discoverable via the refusal message even if docs stay terse.
- **Sync read in agentFor**: the policy read must stay lazy so declared
  identities never pay for it (same argument as the bridge thunk).
- **Drift between the three consumers**: mitigated by one resolver reading
  one axis; the specs pin all three to the same behaviour.

## notes

- The refusal text must keep the x00694/x00699 guarantees: never invent,
  never use the machine.
- `unrecognizedModel.use` is normalised through `normalizeWorkAgentId`, and
  a value that cannot survive normalisation is a validation violation, not
  a silent empty ref.
