/**
 * Contracts for the one-call project adoption orchestrator (f00157 S1).
 *
 * Interfaces live here (contracts/interfaces/) per the repo convention;
 * the tool implementation in `lib/adopt/adopt-project.tool.ts` imports
 * them. Keeping the shapes in the contracts layer lets the pure plan
 * builder and its tests depend on a stable, dependency-light surface.
 */
import type {
	IFileReader,
	IProjectAnalysis,
} from '../../bootstrap/analyze-project';
import type { IScaffoldedFile } from '../../scaffold/scaffold-host';
import type { ICorePaths } from './core-paths.interface';
import type { IWorkspacePathProvider } from './workspace-paths.interface';

export type IAdoptProjectPreset = 'lean' | 'standard' | 'minimal' | 'swarm';

/** Pure inputs: everything the plan builder needs, no I/O. */
export interface IBuildAdoptProjectPlanInput {
	readonly analysis: IProjectAnalysis;
	readonly topLevelDirs: readonly string[];
	readonly projectName: string;
	readonly namespacePrefix: string;
	readonly mcpServerName: string;
	readonly docsDir: string;
	readonly defaultModel?: string;
	/** Optional `owner/name` slug — consent-gated issues wiring. */
	readonly repo?: string;
}

export interface IAdoptProjectPlan {
	readonly preset: IAdoptProjectPreset;
	readonly config: Record<string, unknown>;
	readonly rationale: readonly string[];
	readonly files: readonly IScaffoldedFile[];
	/** Human-owned steps that remain after everything is written. */
	readonly residual: readonly string[];
}

/** Tool dependencies resolved by the assembly layer. */
export interface IAdoptProjectToolDeps {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly corePaths: ICorePaths;
	readonly reader: IFileReader;
}
