/**
 * capability-injection.spec.ts — capability-injection layer.
 *
 * `router-enforcement.spec.ts` (sibling file) proves DETECTION:
 * `invokeTool` catches a handler that ignored `args.dryRun` only AFTER
 * it already ran, by inspecting the return value. This file proves the
 * stronger property that closes that gap: `invokeTool` now opens an
 * AMBIENT dry-run scope (`dry-run/dry-run-scope.helper.ts`) around the
 * handler call, so a capability built ONCE at plugin register time
 * (before any tool call, closed over by the handler forever) still
 * refuses its real effect on a per-call basis — even when the handler
 * itself never reads `args.dryRun` and unconditionally calls the
 * capability.
 *
 * This models the actual shape of the codebase: `IMcpPluginContext` is
 * built once per plugin at boot (`register(ctx)`), so a capability
 * like `ctx.effects.git` cannot be "constructed fresh" from `args` the
 * way a hand-rolled per-call factory could. The capability instead
 * re-reads the ambient flag on every invocation
 * (`effect-capability-factory.helper.ts`), which is what the router
 * seeds before calling the handler.
 */
export {};
