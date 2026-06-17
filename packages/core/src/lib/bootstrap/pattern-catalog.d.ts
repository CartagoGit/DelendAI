import type { IProjectType } from './analyze-project';
export interface IRecommendedTool {
    readonly name: string;
    readonly description: string;
}
/**
 * The data behind "knowing what an optimal MCP server needs" for a
 * project, without anyone telling the agent. One entry per project
 * type maps to the tools, plugins and guidance that suit it. Extend
 * this catalog to teach the analyzer about new project shapes.
 */
export interface IProjectPattern {
    readonly type: IProjectType;
    readonly describe: string;
    /** Project-specific tools worth scaffolding (namespaced at use). */
    readonly recommendedTools: readonly IRecommendedTool[];
    /** mcp-core plugins worth loading via `--plugins`. */
    readonly recommendedPlugins: readonly string[];
    /** Short guidance lines surfaced to the agent. */
    readonly knowledgeHints: readonly string[];
}
export declare const PROJECT_PATTERN_CATALOG: Readonly<Record<IProjectType, IProjectPattern>>;
