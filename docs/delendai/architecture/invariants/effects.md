# Invariants — effects

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariant: no real effect bypasses the policy engine

**Current state**: TRUE — fixed by `x00288` (effect boundaries
lint). **Was FALSE in the audit** (`AUD-D01`): nothing prevented
a plugin from importing `node:child_process`, `node:fs`, `node:net`,
or `node:http` directly, fully bypassing the effect broker and its
policy engine.

**Test that guards it**: `tools/scripts/lint/effect-boundaries.script.ts`
(ratchet with baseline — 0 new violations allowed) +
`tools/scripts/lint/effect-boundaries.script.spec.ts`. Runs in
`bun run validate` (`lint:effect-boundaries`) and in the
"lint architecture" step of `.github/workflows/ci.yml`.

## Invariant: dry-run cannot produce effects

**Current state**: TRUE — fixed by `r00037`
(`EffectBroker`/`createDryRunGatedGitRunner`). **Was FALSE in the
audit** (`AUD-D02`): `guardEffectCapability`/`runWithDryRunGate`
existed as primitives but had no real consumers in the runtime — a
`dry-run: true` did not prevent anything by itself; it depended on
each caller remembering to invoke the guard.

**Test that guards it**: `packages/core/tests/src/lib/dry-run/*`
(50/50 cases) and
`packages/core/tests/src/lib/capabilities/effect-broker.spec.ts`
(includes the property test over the 5 categories of
`TEffectCapabilityKind`).

## Invariant: granted capabilities are observable

**Current state**: TRUE.

**Test that guards it**:
`packages/core/tests/src/lib/capabilities/effect-broker.spec.ts`,
`packages/core/tests/src/lib/capabilities/versioning.spec.ts`,
`packages/core/tests/src/lib/capabilities/shim.spec.ts`, and
`packages/core/tests/src/lib/capabilities/adversarial.spec.ts`
(adversarial cases over the capability shim).
