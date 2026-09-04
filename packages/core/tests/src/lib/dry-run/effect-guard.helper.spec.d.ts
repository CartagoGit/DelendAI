/**
 * effect-guard.spec.ts — f00189 follow-up (Track F / security).
 *
 * `enforce.ts`'s `enforceDryRunReturnContract` only rejects a
 * malformed response AFTER a handler has already run — a handler
 * that ignores `args.dryRun` still performs its mutation before
 * being told its response was wrong. These tests prove the stronger
 * property this module adds: a handler that ignores `dryRun`
 * entirely and unconditionally calls a guarded capability must be
 * PREVENTED from performing the effect, not merely rejected
 * afterwards.
 */
export {};
