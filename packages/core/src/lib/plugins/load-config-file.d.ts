import { z } from 'zod';
/**
 * Per-plugin configuration loaded from `mcp-core.config.json`. This is
 * the structured way to pass values to plugins: each plugin gets a
 * typed `options` object (any JSON — nested objects, arrays…) plus an
 * optional tool-namespace `prefix`. CLI flags override these roots; the
 * file is the place for anything beyond a quick override.
 *
 * ```jsonc
 * {
 *   "cacheDir": ".cache/mcp-core",
 *   "docsDir": "docs/mcp-core",
 *   "plugins": {
 *     "proposals": { "prefix": "work", "options": { "docsDir": "docs/x" } }
 *   }
 * }
 * ```
 */
export interface IMcpCorePluginConfig {
    readonly prefix?: string;
    readonly options?: Readonly<Record<string, unknown>>;
}
export interface IMcpCoreConfigFile {
    readonly cacheDir?: string;
    readonly docsDir?: string;
    /** Quality-gate commands per scope, surfaced by `get_validation_matrix`. */
    readonly validationMatrix?: {
        readonly scopes: Readonly<Record<string, ReadonlyArray<{
            command: string;
            expect: string;
        }>>>;
    };
    readonly plugins?: Readonly<Record<string, IMcpCorePluginConfig>>;
}
/** Default config file name looked up at the workspace root. */
export declare const DEFAULT_CONFIG_FILENAME = "mcp-core.config.json";
/** Structural schema for the config file (used by `--check`). */
export declare const CONFIG_FILE_SCHEMA: z.ZodObject<{
    cacheDir: z.ZodOptional<z.ZodString>;
    docsDir: z.ZodOptional<z.ZodString>;
    validationMatrix: z.ZodOptional<z.ZodObject<{
        scopes: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
            command: z.ZodString;
            expect: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    plugins: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        prefix: z.ZodOptional<z.ZodString>;
        options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>>;
}, z.core.$strict>;
/**
 * Validate raw config-file contents and report problems. Used by the
 * `--check` doctor and at boot. Missing file → no issues. Invalid JSON
 * or schema violations → human-readable issue strings.
 */
export declare const diagnoseConfigFile: (raw: string | undefined) => {
    readonly present: boolean;
    readonly issues: readonly string[];
};
/**
 * Parse a config file's raw contents. Pure and forgiving: missing
 * (`undefined`) or invalid JSON yields an empty config, so a typo in
 * the file never crashes the server — it just contributes nothing.
 */
export declare const parseConfigFile: (raw: string | undefined) => IMcpCoreConfigFile;
/** Resolve the per-plugin entry, never undefined. */
export declare const pluginConfigFor: (config: IMcpCoreConfigFile, pluginName: string) => IMcpCorePluginConfig;
