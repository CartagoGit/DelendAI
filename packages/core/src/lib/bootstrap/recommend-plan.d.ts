import type { IProjectAnalysis } from './analyze-project';
import type { IRecommendedTool } from './pattern-catalog';
export interface IServerPlanOptions {
    readonly serverName?: string;
    readonly namespacePrefix?: string;
    readonly cacheDir?: string;
    readonly docsDir?: string;
}
export interface IServerPlan {
    readonly projectType: IProjectAnalysis['projectType'];
    readonly serverName: string;
    readonly namespacePrefix: string;
    /** mcp-core plugins to load via `--plugins`. */
    readonly plugins: readonly string[];
    /** Project-specific tools to scaffold. */
    readonly tools: readonly IRecommendedTool[];
    /** Suggested quality-gate commands, by role. */
    readonly validationCommands: Readonly<Record<string, string>>;
    readonly cacheDir: string;
    readonly docsDir: string;
    /** A ready-to-paste mcp.json server entry. */
    readonly mcpJson: Readonly<Record<string, unknown>>;
    /** Human + agent guidance for executing the plan. */
    readonly notes: readonly string[];
}
/**
 * Turn an analysis into a concrete, editable server plan. Pure: the
 * agent reviews the plan, tweaks names/plugins if needed, then asks
 * `create_server` to materialise it. The plan is the "what an optimal
 * MCP server needs here" recommendation, derived from the pattern
 * catalog — no human had to spell it out.
 */
export declare const recommendServerPlan: (analysis: IProjectAnalysis, options?: IServerPlanOptions) => IServerPlan;
