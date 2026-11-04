# Deprecation policy (f00152)

This document codifies the project's deprecation contract. Every
breaking change in `@delendai/core` MUST honor the contract below.

## Shape changes (L2 — compat window)

When a facade tool's `inputSchema` adds, renames, or removes a
field:

1. Add the new shape as `v2` in the tool's `.compat.ts` wrapper.
2. Keep the old shape as `v1` with a `translate` function that maps
   the old payload to the new one.
3. The handler accepts the union `[v2, v1]`. On a v1 call, the
   response includes `deprecatedShapeUsed: { version, sinceVersion,
   removedIn, migrationHint }`.
4. The flag ships for exactly one release cycle (the one between
   `sinceVersion` and `removedIn`). On `removedIn`, v1 hard-fails.

## Behavior changes (L3 — feature flags)

When a tool's underlying behavior changes (new state-machine guard,
new required arg, new migration path):

1. Introduce a feature flag with `defaultValue: false`.
2. The flag ships for at least one release cycle. Default-off means
   legacy behavior remains canonical.
3. On `removalVersion`, the flag is deleted and the new behavior
   becomes canonical.

See [FEATURE-FLAGS.md](FEATURE-FLAGS.md) for the catalog format.

## Tool removal (L4 — stable facade)

Removing a tool from the stable facade requires a two-release
deprecation cycle:

1. Mark the descriptor `@deprecated` in
   `packages/core/src/lib/api/stable-facade.ts` with a comment
   naming the replacement or the removal release.
2. Ship one more release with the descriptor still present.
3. On the third release, remove the descriptor. The release script
   regenerates `docs/delendai/api/stable.json` to drop the tool.

Tools outside the facade may be removed on any release without a
deprecation cycle.

## Non-shape behavior changes (no contract)

Pure-logic changes that don't affect `inputSchema` or `outputSchema`
(e.g. a new validation rule, a new guard, a new diagnostic) do not
require deprecation. They are released as part of the next minor.
A consumer that depends on the old behavior (e.g. a state-machine
edge case) gets a structured warning in the response when the new
guard fires — that is the only contract.

## How the contract is enforced

- `bun run lint:compat-window` — fails when a non-facade tool
  imports a compat helper.
- `bun run lint:feature-flags` — fails when the catalog is
  malformed.
- `bun run verify:stable-manifest` — fails when the manifest and
  the descriptors disagree.
- `bun run lint:core-version-pin` — fails when the pinned version
  is not published.