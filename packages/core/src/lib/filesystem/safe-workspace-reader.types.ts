import type { Stats } from 'node:fs';

export type WorkspaceContainmentReason =
	| 'invalid-input'
	| 'outside-workspace'
	| 'reserved-path'
	| 'symlink-outside';

export interface ContainedPathResult {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly originalPath: string;
	readonly wasAbsolute: boolean;
}

export interface SafeReadResult {
	readonly path: ContainedPathResult;
	readonly content: string;
	readonly stats: Stats;
}

export interface SafeStatResult {
	readonly path: ContainedPathResult;
	readonly stats: Stats;
}

export interface SafeListEntry {
	readonly path: ContainedPathResult;
	readonly stats: Stats;
}

export interface SafeListResult {
	readonly path: ContainedPathResult;
	readonly entries: readonly SafeListEntry[];
}

export interface ISafeWorkspaceReader {
	resolve(inputPath: string): ContainedPathResult;
	readText(inputPath: string): Promise<SafeReadResult>;
	stat(inputPath: string): Promise<SafeStatResult>;
	list(
		inputPath: string,
		options?: {
			readonly recursive?: boolean;
			readonly maxDepth?: number;
		},
	): Promise<SafeListResult>;
	exists(inputPath: string): Promise<ContainedPathResult | null>;
}
