# Invariants — plugin lifecycle

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariant: `register` happens exactly once per plugin

**Current state**: TRUE.

**Test that guards it**:
`packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts`
(new, d00015 S1) — complements the existing coverage in
`register-cancel-dispose.spec.ts` and `load-plugins.spec.ts`.

**Why it matters**: a silently re-invoked `register()` (for example,
a poorly isolated retry, or two activation paths that do not share
state) would duplicate listeners, timers, or resource handles.

## Invariant: `dispose` happens at most once per plugin

**Current state**: TRUE.

**Test that guards it**:
`packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts`
(new, d00015 S1) — complements `register-cancel-dispose.spec.ts`.

**Why it matters**: a double `dispose()` may close an already-released
resource (logical double-free) or throw over an invalid handle during
shutdown, exactly the moment when a failure is hardest to diagnose.

## Invariant: eager and lazy have identical semantics

**Current state**: TRUE — fixed by `r00038`
(`PluginActivationSession`, a single activation path for both modes).
**Was FALSE in the audit** (`AUD-E01`): the lazy path did not apply
`optionsSchema` (defaults/coercion/transforms), did not honor
`registerTimeoutMs`, and did not guarantee idempotent dispose — a
plugin behaved differently depending on which activation path loaded
it, without anything flagging it.

**Test that guards it**:
`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`
(parameterized equivalence test, `t00029`, runs the same case through
both paths and compares the result) +
`packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts`.

## Invariant: timeout and `AbortSignal` work on both paths

**Current state**: TRUE — same fix as the previous invariant
(`r00038`). Before, only the eager path honored `registerTimeoutMs`.

**Test that guards it**:
`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`
(case `AUD-E01.b`, "applies registerTimeoutMs to a register() that
never resolves").

## Invariant: a partial failure reverts in reverse order of registration

**Current state**: TRUE.

**Test that guards it**:
`packages/core/tests/src/lib/plugins/lifecycle.spec.ts` and
`packages/core/tests/src/lib/plugins/register-cancel-dispose.spec.ts`.
`r00039` (`McpHostSession.dispose`) generalized this guarantee to the
full session teardown, not just to plugin loading.
