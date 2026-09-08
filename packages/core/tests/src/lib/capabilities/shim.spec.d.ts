/**
 * shim.spec.ts — f00188 (Track F / security).
 *
 * The capability pipeline must accept plugins that ship WITHOUT an
 * explicit `capabilities` field (legacy / first wave of migration).
 * The shim grants every capability with a single boot-time warning
 * so the host still loads the plugin — the lint escalates to an
 * error after the migration window closes.
 */
export {};
