/**
 * The host's quality-gate commands, grouped by scope. mcp-core tools
 * (e.g. run-quality engines, once migrated) execute these commands
 * verbatim instead of hardcoding `bun run ...` invocations.
 */
export interface IValidationCommand {
    readonly command: string;
    /** Expected outcome, e.g. `exit0`, `pass`, `synchronized`. */
    readonly expect: string;
}
export interface IValidationMatrix {
    /** Scope name (e.g. `full`, `tools`, `proposals`) → commands. */
    readonly scopes: Readonly<Record<string, readonly IValidationCommand[]>>;
}
