# The `dryRun` contract — what it guarantees, before and after r00037

This document states plainly what `dryRun: true` guarantees a caller
today, and how that guarantee changed across r00037's slices. It exists
because `AUD-D02` (2026-08-27 independent audit) found the previous
state — dry-run as a post-hoc detector rather than a barrier — critical
enough to name explicitly, and because the guarantee is uneven across
the tool surface: it depends on whether a given tool's handler was
built with `ctx.effects` (the `EffectBroker`) or reaches for `node:fs`
/ `child_process` / `fetch` directly.

## Before r00037 (S1) — detection only

`ToolSurfaceRuntime.invokeTool`
(`packages/core/src/lib/project/tool-surface-runtime.service.ts`)
called the handler, then checked its RETURN VALUE with
`enforceDryRunReturnContract` (`dry-run/enforce.ts`). If
`args.dryRun === true` and the handler did not return a valid
`IDryRunResult`, the caller got a typed refusal — but only after the
handler had already run to completion. A handler that ignored
`args.dryRun` and wrote a file, pushed to git, spawned a process, or
called an external API had already done so by the time the refusal was
computed. The code's own comment at the time called this what it was:
detection, not prevention.

**Guarantee under S1 alone:** none, for a handler that does not use
`ctx.effects`. The caller learns, after the fact, that the plugin
misbehaved. Nothing stopped the misbehaviour.

## S1 (shipped) — detection made noisy and persistent

`dry-run/dry-run-violation-log.ts` (new) records every contract
violation `enforceDryRunReturnContract` catches, keyed by the
responsible `tool`/`pluginId`, in a bounded ring buffer
(`listDryRunViolations()` / `clearDryRunViolationsForTests()`,
mirroring the force-push audit trail in `shared/git-write.ts`). This
does not change the guarantee above — the handler has still already
run — but it turns an invisible failure into a nameable one: a host
can surface `listDryRunViolations()` (e.g. in `report_status`) and see
exactly which plugin needs to migrate next, instead of the violation
disappearing into a single tool-call response.

**Guarantee under S1:** still detection-only for unmigrated handlers,
but now AUDITABLE — no violation goes unrecorded.

## S2/S3 (shipped) — the `EffectBroker`, real prevention for `git`

`capabilities/effect-broker.ts`'s `createEffectBroker` is the single
point of construction for every ambient-dry-run-gated capability a
plugin context hands out. Given a map of `{ kind, perform, describe? }`
definitions, it returns the matching map of guarded functions: each
one re-reads the ambient dry-run flag
(`dry-run/dry-run-scope.helper.ts`'s `AsyncLocalStorage` scope, opened
once per tool call by `invokeTool` around the handler) on EVERY call
and throws `DryRunEffectRefusedError` before reaching the real
implementation whenever that flag is `true`.

`cli/assemble.ts` calls `createEffectBroker` once per host boot to
build `IPluginEffectsCapability`, currently covering exactly one
capability — `git` — and hands the SAME shared instance to every
plugin's `ctx.effects`. A plugin's write tools (`plugins/git`'s pilot
migration) that call `ctx.effects.git(...)` cannot reach the real `git`
binary while the CURRENT tool call's `args.dryRun` is `true`, whether
or not the handler itself reads that flag.

**Guarantee under S2/S3, for a handler using `ctx.effects.git`:** the
mutation is impossible, not merely detectable, while `dryRun` is true.
Proven end-to-end (not just at the primitive level) in
`packages/core/tests/src/lib/e2e/effect-broker-dry-run.e2e.spec.ts`,
including against a REAL temp git repository — a dry-run call leaves
`git log` on that repository completely unchanged.

**Guarantee under S2/S3, for every other capability kind
(`write`/`delete`/`spawn`/`network`) and for the ~50 plugins that do
not yet call `ctx.effects` at all:** still detection-only (S1's
recorded, but post-hoc, refusal). `EffectBroker` is generic over these
kinds — `effect-broker.spec.ts` proves the property holds for all five
— but nothing FORCES a plugin to route its filesystem write, spawn, or
network call through it instead of importing the Node built-in
directly. That migration is `r00034`'s scope, not this document's.
`x00288`'s effect-boundary lint is the complementary control that
makes bypassing `ctx.effects` entirely (importing `node:fs` /
`child_process` / `fetch` in a plugin's own code) visible in CI; the
`EffectBroker` only protects what is actually routed through it.

## Summary table

| Capability path | Before r00037 | After r00037 (today) |
| --- | --- | --- |
| `ctx.effects.git` (plugins/git pilot) | detection (post-hoc) | **prevention** — mutation impossible under `dryRun: true` |
| `ctx.effects.{write,delete,spawn,network}` | did not exist | primitive proven generic (`effect-broker.spec.ts`); no production consumer yet |
| A plugin's own `node:fs` / `child_process` / `fetch` call | detection (post-hoc) | detection (post-hoc), now audit-logged with plugin/tool attribution (S1) |

A caller cannot tell, from `args.dryRun` alone, which row of this table
a given tool falls into — that is the residual gap `r00034`'s plugin
migration closes, tool by tool.
