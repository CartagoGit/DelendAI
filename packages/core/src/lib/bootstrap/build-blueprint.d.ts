import type { IScaffoldedFile } from '../scaffold/scaffold-host';
import type { IProjectAnalysis } from './analyze-project';
export interface IBlueprintArtifact {
    readonly name: string;
    readonly description: string;
}
/**
 * The EXHAUSTIVE plan for a project-specific MCP server: every tool,
 * prompt, skill and agent worth creating for this project, plus whether
 * tests are included and whether one already exists. Derived from the
 * analysis + the pattern catalog + the project's own scripts — not just
 * one or two suggestions.
 */
export interface IServerBlueprint {
    readonly serverName: string;
    readonly namespacePrefix: string;
    readonly projectType: IProjectAnalysis['projectType'];
    readonly plugins: readonly string[];
    readonly tools: readonly IBlueprintArtifact[];
    readonly prompts: readonly IBlueprintArtifact[];
    readonly skills: readonly IBlueprintArtifact[];
    readonly agents: ReadonlyArray<{
        slot: string;
        description: string;
    }>;
    readonly tests: boolean;
    readonly hasExistingServer: boolean;
    readonly notes: readonly string[];
}
export interface IBlueprintOptions {
    readonly serverName?: string;
    readonly namespacePrefix?: string;
    readonly tests?: boolean;
}
/** Build the exhaustive blueprint from a project analysis. */
export declare const buildServerBlueprint: (analysis: IProjectAnalysis, options?: IBlueprintOptions) => IServerBlueprint;
/**
 * Materialise the blueprint into concrete files: the host project, plus
 * a file per tool/prompt/skill (and a test per tool when enabled). The
 * returned files are for the AGENT to write — nothing is written here.
 */
export declare const buildBlueprintFiles: (blueprint: IServerBlueprint, serverPackageName?: string) => readonly IScaffoldedFile[];
