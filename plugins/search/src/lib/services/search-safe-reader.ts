import type { Stats } from 'node:fs';

import {
	type SafeWorkspaceReader,
	WorkspaceContainmentError,
	type ContainedPathResult,
} from '@mcp-vertex/core/public';

const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx'] as const;

const hasTypeScriptExtension = (pathValue: string): boolean =>
	TYPESCRIPT_EXTENSIONS.some((extension) => pathValue.endsWith(extension));

const basenameOf = (pathValue: string): string => {
	const parts = pathValue.split('/');
	return parts.at(-1) ?? pathValue;
};

export interface IResolvedSearchRoot {
	readonly input: string;
	readonly path: ContainedPathResult;
	readonly stats: Stats;
}

interface IRejectedSearchRoot {
	readonly input: string;
	readonly reason: 'contained' | 'missing';
}

export interface IResolvedSearchRoots {
	readonly roots: readonly IResolvedSearchRoot[];
	readonly rejected: readonly string[];
	readonly missing: readonly string[];
}

const classifyRootResolutionError = (
	error: unknown,
): IRejectedSearchRoot['reason'] | undefined => {
	if (error instanceof WorkspaceContainmentError) return 'contained';
	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'ENOENT'
	) {
		return 'missing';
	}
	return undefined;
};

export const resolveSearchRoots = async (
	reader: SafeWorkspaceReader,
	inputRoots: readonly string[],
): Promise<IResolvedSearchRoots> => {
	const roots: IResolvedSearchRoot[] = [];
	const rejected: string[] = [];
	const missing: string[] = [];
	for (const input of inputRoots) {
		try {
			const resolved = await reader.stat(input);
			roots.push({
				input,
				path: resolved.path,
				stats: resolved.stats,
			});
		} catch (error) {
			const reason = classifyRootResolutionError(error);
			if (reason === 'contained') {
				rejected.push(input);
				continue;
			}
			if (reason === 'missing') {
				missing.push(input);
				continue;
			}
			throw error;
		}
	}
	return { roots, rejected, missing };
};

export const listContainedTypeScriptFiles = async (
	reader: SafeWorkspaceReader,
	inputPath: string,
): Promise<readonly string[]> => {
	const { path, stats } = await reader.stat(inputPath);
	if (stats.isFile()) {
		return hasTypeScriptExtension(path.relativePath)
			? [path.relativePath]
			: [];
	}
	if (!stats.isDirectory()) return [];

	const files: string[] = [];
	const stack = [path.relativePath];
	while (stack.length > 0) {
		const current = stack.pop() ?? '.';
		const listing = await reader.list(current);
		const entries = [...listing.entries].sort((left, right) =>
			left.path.relativePath.localeCompare(right.path.relativePath),
		);
		for (const entry of entries) {
			if (entry.stats.isDirectory()) {
				const dirName = basenameOf(entry.path.relativePath);
				if (!SEARCH_SKIP_DIRS.has(dirName)) {
					stack.push(entry.path.relativePath);
				}
				continue;
			}
			if (
				entry.stats.isFile() &&
				hasTypeScriptExtension(entry.path.relativePath)
			) {
				files.push(entry.path.relativePath);
			}
		}
	}
	return files;
};
