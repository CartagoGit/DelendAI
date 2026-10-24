# Invariants — adaptive surface

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariant: visible ≠ loaded ≠ active ≠ callable

**Current state**: TRUE — the audit explicitly highlights this one
as the only one of its four examples that **was already well-designed**
before this audit, not as a correction. It is documented and protected
here precisely so that "well-designed today" is not confused with
"guaranteed forever" — without a dedicated test, a future refactor of
the tool-surface runtime could collapse these four states without
anything flagging it.

The four states are independent:

- **visible**: the tool appears in the catalog a client can
  discover (`tools/list` or the `vertex` router).
- **loaded**: the owning plugin's module has been imported.
- **active**: the plugin is effectively registered in the session.
- **callable**: a real invocation of the tool can complete right now
  (for example, it is not in the middle of a deactivation).

A tool can be visible without being loaded (`managed` surface, lazy
activation); it can be loaded without being active (half-failed
registration); it can be active without being callable at a given
moment (in-flight eviction). Collapsing any of these distinctions in
code would amount to assuming, for example, that "it appears in the
list" implies "it can be called now" — exactly the kind of assumption
that broke `AUD-E01` in another subsystem.

**Test that guards it**:
`packages/core/tests/src/lib/project/adaptive-surface-invariants.spec.ts`
(new, d00015 S2) — complements the existing coverage in
`tool-surface-runtime.spec.ts`, `tool-surface-runtime.exposure.spec.ts`,
and `managed-lazy-runtime.spec.ts`, which already exercise these
states separately but do not explicitly assert that they are four
distinct concepts.

## Invariant: a tool never disappears while it is in-flight

**Current state**: TRUE.

**Test that guards it**:
`packages/core/tests/src/lib/project/tool-surface-runtime-eviction.spec.ts`
and its property-based counterpart,
`tool-surface-runtime-eviction.property.spec.ts`.

## Invariant: activation and deactivation have hysteresis

**Current state**: NOT IMPLEMENTED (`AUD-C03`). The audit flags it
as "doesn't exist today" — the current behavior isn't wrong; rather,
there is no hysteresis mechanism: a tool can be activated and
deactivated in rapid succession (thrashing) without any cool-down
period.

**If FALSE / not implemented**: `f00273` — "Ranking, confidence
threshold, and hysteresis in tool search" (status: `blocked`) is the
follow-up proposal that would close this invariant. Until that is
implemented, this document is the written evidence that the absence
is known and not a silent oversight.
