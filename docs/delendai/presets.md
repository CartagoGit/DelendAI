# Preset derivation

`packages/core/src/lib/plugins/preset-catalog.ts` is the single source of truth
for preset membership.

- Effective membership comes from `resolvePresetMembers(...)`.
- Human-facing summaries are derived from that effective membership, so they
  cannot mention plugins the preset does not actually ship.
- Preset budgets keep the measured numeric baseline, but the composed runtime
  profile (`permissions`, `capabilities`) is derived from the effective plugin
  membership on every load.

When a plugin is added to or removed from a preset, update the membership once
in the catalog and let the derived summary/budget follow automatically.