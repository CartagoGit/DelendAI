/**
 * plugin-defaults.interface.ts — f00037 contract surface for
 * `contracts/constants/plugin-defaults.constant.ts`.
 *
 * `IPluginDefaults` is the row shape of the canonical default-options
 * map (`PLUGIN_DEFAULTS`). The shape lives here because
 * `contracts/constants/` reserves the module for **values**, not type
 * declarations.
 */

export type IPluginDefaults = Readonly<Record<string, Record<string, unknown>>>;