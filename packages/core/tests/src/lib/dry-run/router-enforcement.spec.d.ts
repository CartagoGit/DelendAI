/**
 * router-enforcement.spec.ts — f00189 (Track F / security).
 *
 * `enforceDryRunReturnContract` (dry-run/enforce.ts) used to have ZERO
 * production call sites — it was wired only into its own definition,
 * the public barrel, and unit specs that call the helper directly.
 * `dryRun: true` was, in practice, an argument a plugin could ignore
 * with nothing in the runtime checking anything.
 *
 * These tests exercise the ACTUAL dispatch path
 * (`ToolSurfaceRuntime.invokeTool`, in
 * `packages/core/src/lib/project/tool-surface-runtime.service.ts`)
 * rather than calling `enforceDryRunReturnContract` in isolation, so a
 * regression that un-wires the enforcement (e.g. someone bypasses
 * `invokeTool` or strips the call out of it again) fails a test that
 * actually routes a call, not just a helper-level unit test.
 *
 * Enforcement level: DETECTION, not prevention. The handler below has
 * already run — and could already have performed a real side effect —
 * by the time its return value is checked. Since 8f05b5d2 / r00037,
 * `IMcpPluginContext.effects` DOES hand plugins a guarded capability
 * (`git`, via the `EffectBroker` — `capabilities/effect-broker.ts`)
 * that closes this gap for plugins that use it; see
 * `capability-injection.spec.ts` (sibling file) and
 * `capabilities/effect-broker.spec.ts` for the PREVENTION-level
 * property. This file's handler intentionally does NOT use
 * `ctx.effects` — it models a plugin that still reaches for its own
 * unguarded mutation (or hasn't migrated yet), which is exactly the
 * case S1's violation log (`dry-run-violation-log.ts`) exists to make
 * visible rather than silent.
 */
export {};
