/**
 * Read-only, injectable view of the target project. The default
 * implementation (in `bootstrap-tool.ts`) reads from disk relative to
 * the workspace root; tests pass an in-memory reader. Keeping I/O
 * behind this seam is what makes the analyzer pure and agnostic.
 */
export interface IFileReader {
    /** Returns file contents, or undefined if it does not exist. */
    readFile(relativePath: string): string | undefined;
    exists(relativePath: string): boolean;
    /** Top-level entries of a directory (names only), or []. */
    listDir(relativePath: string): readonly string[];
}
export type IProjectType = 'library' | 'cli' | 'webapp' | 'game' | 'monorepo' | 'generic';
export type IProjectLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'unknown';
export interface IProjectAnalysis {
    readonly hasPackageJson: boolean;
    readonly name: string | undefined;
    readonly projectType: IProjectType;
    readonly language: IProjectLanguage;
    readonly packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | 'unknown';
    readonly framework: string | undefined;
    readonly testRunner: 'vitest' | 'jest' | 'bun' | 'node' | 'unknown';
    /** Monorepo tool detected (e.g. `nx`, `turbo`, `bun-workspaces`). */
    readonly monorepoTool: string | undefined;
    /** True if the project already ships (or depends on) an MCP server. */
    readonly hasMcpServer: boolean;
    /** Evidence behind `hasMcpServer`. */
    readonly mcpEvidence: readonly string[];
    /** Detected CI systems (file evidence). */
    readonly ci: readonly string[];
    /** Detected AI-agent config files already in the repo. */
    readonly agentConfigs: readonly string[];
    /** Recognised quality-gate scripts, by role. */
    readonly scripts: Readonly<Record<string, string>>;
    /** Free-form notes the recommender and the agent can use. */
    readonly signals: readonly string[];
}
/**
 * Inspect a project through a read-only reader and produce a structured
 * analysis. Never throws on malformed input — missing or invalid files
 * degrade to `unknown`/`generic` so the recommender always has data.
 */
export declare const analyzeProject: (reader: IFileReader) => IProjectAnalysis;
