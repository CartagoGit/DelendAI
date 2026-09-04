# Feature flags (f00152 S5 — L3)

Feature flags are how `@delendai/core` and its plugins evolve
behavior without breaking consumers. Every flag is **default-off**:
the legacy behavior is the canonical contract, and opt-in is the
only path to the new behavior.

## When to introduce a flag

Introduce a flag when a behavior change is:

- Risky (state-machine guard, new required field, migration logic).
- Not strictly required for correctness.
- Worth dogfooding on a small subset of consumers before going
  canonical.

Do **not** introduce a flag for cosmetic changes, log-message tweaks,
or anything where the new behavior is strictly better and the old
behavior is a bug.

## How to introduce a flag

1. Add an entry to `docs/mcp-vertex/api/feature-flags.md` with:
   - `name` — the dotted key (`plugin.shortName`).
   - `sinceVersion` — the package version that first ships the flag.
   - `defaultValue` — always `false`.
   - `removalVersion` — the package version on which the flag is
     deleted and the new behavior becomes canonical.
   - `description` — one sentence on what the flag does.
2. Read the flag at runtime via
   `coreFeatureFlag(ctx, 'plugin.shortName')` from
   `@delendai/core/public`.
3. Default-off: the legacy path is always the canonical one. The
   flag opts the consumer INTO the new path.

## Lifecycle

| Release | Action |
| --- | --- |
| 0.1.0 | Flag ships. `defaultValue: false`. Legacy behavior canonical. |
| 0.2.0 | Flag marked `@deprecated` in the catalog. New behavior opt-in. |
| 0.3.0 | Flag deleted. New behavior canonical. |

The release script (`bun run release`) reads the catalog and refuses
to ship a release that has not bumped the `removalVersion` of a flag
whose `sinceVersion` is two releases behind.

## Consumer opt-in

```jsonc
// mcp-vertex.config.json
{
  "featureFlags": {
    "proposals.peerReviewBypass": true
  }
}
```

Or per-plugin:

```jsonc
{
  "plugins": {
    "proposals": {
      "options": {
        "featureFlags": { "peerReviewBypass": true }
      }
    }
  }
}
```

## Catalog

The canonical catalog is `docs/mcp-vertex/api/feature-flags.md`.
Run `bun run lint:feature-flags` to verify the catalog is well-formed.