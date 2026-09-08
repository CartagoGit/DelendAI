/**
 * contract-helpers.spec.ts — f00189 (Track F / security).
 *
 * Unit coverage for the two PURE helpers in `dry-run/enforce.ts`, in
 * isolation from any router or runtime:
 *
 *   - `validateToolDryRunManifest` — the boot-time warning for a tool
 *     that declares non-empty `effects` without `dryRunSupported: true`.
 *   - `enforceDryRunReturnContract` — given `args` and a handler's
 *     `result`, decide forward-vs-refuse.
 *
 * This file does NOT exercise the router or `ToolSurfaceRuntime` — it
 * calls the helpers directly to pin their input/output contract. The
 * router actually wires `enforceDryRunReturnContract` into a live
 * `invokeTool` dispatch; that end-to-end behaviour (a handler that
 * ignores `dryRun` and the caller getting a typed refusal instead of
 * the bogus payload) is covered by
 * `tests/src/lib/dry-run/router-enforcement.spec.ts`, which drives the
 * runtime instead of calling this helper in isolation.
 */
export {};
