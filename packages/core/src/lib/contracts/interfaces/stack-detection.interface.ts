/**
 * stack-detection.interface.ts — r00011 S2: the pure contract for
 * `detectStack(deps)`.
 *
 * Pure data — no I/O. The concrete `detectStack(deps)` reads through
 * injected `IStackProbeDeps` so the planner/parsers are unit-tested
 * without spawning a subprocess or hitting the filesystem.
 */

export type IDetectedStackPack =
	| 'web-app'
	| 'backend-api'
	| 'cli-tool'
	| 'library'
	| 'data'
	| 'monorepo'
	| 'security-hardened'
	| 'unknown';

export interface IStackRecommendation {
	readonly pack: IDetectedStackPack;
	readonly confidence: number;
	readonly reasons: readonly string[];
}

export interface IStackProbeDeps {
	readonly readJson: (path: string) => Promise<unknown | null>;
	readonly readText: (path: string) => Promise<string | null>;
	readonly listFiles: (root: string, globs: readonly string[]) => readonly string[];
}

export interface IStackDetectionResult {
	readonly recommendations: readonly IStackRecommendation[];
	readonly top: IDetectedStackPack;
	readonly detectedLanguages: readonly string[];
	readonly detectedFrameworks: readonly string[];
}