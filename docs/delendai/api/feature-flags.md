# Feature flags (f00152 S5)

Every flag here is **default-off**. A consumer must opt in to a flag
to receive the new behavior. The legacy behavior is the stable
contract; opt-in is the only path to the new path.

## Lifecycle

1. A flag ships in `delendai.config.json#plugins.<name>.options.featureFlags`
   (or a top-level `featureFlags` block in the future). Default: `false`.
2. One release after the flag is `@deprecated` here, the flag is
   removed and the new behavior becomes canonical.
3. On the release matching `removalVersion`, the flag is deleted.

## Catalog

| Name | Since | Default | Removal | Description |
| --- | --- | --- | --- | --- |
| `proposals.peerReviewBypass` | 0.1.0 | `false` | 0.3.0 | When true, allows same-process peer review approvals. Default false keeps the independent-agent rule enforced. |
| `proposals.legacyProposalMigration` | 0.1.0 | `false` | 0.3.0 | When true, allows the legacy pNNN → new-state migration scripts to run. Default false keeps legacy proposals read-only. |
| `core.driftAutoRepair` | 0.1.0 | `false` | 0.3.0 | When true, runs `state_repair` automatically on plugin boot. Default false keeps boot diagnostic-only. |