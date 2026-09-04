import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import {
	applyCodemodEdits,
	isSupportedCodemodPath,
	type ICodemodRecipe,
} from './recipes';

export interface ICodemodFilePlan {
	readonly path: string;
	readonly before: string;
	readonly after: string;
	readonly diff: string;
	readonly edits: number;
}

export interface ICodemodRunPlan {
	readonly files: readonly ICodemodFilePlan[];
	readonly totalEdits: number;
	readonly language: string;
}

export type ICodemodRunResult =
	| ({ readonly ok: true } & ICodemodRunPlan)
	| {
			readonly ok: false;
			readonly code: 'discover-failed' | 'read-failed';
			readonly detail: string;
	  };

export interface ICodemodRunRequest {
	readonly cwd: string;
	readonly recipe: ICodemodRecipe;
	readonly dryRun?: boolean;
}

export interface ICodemodRunnerDeps {
	readonly listFiles?: (cwd: string) => Promise<readonly string[]>;
	readonly readFile?: (path: string) => Promise<string>;
}

const SKIP_DIRS = new Set([
	'.git',
	'node_modules',
	'dist',
	'build',
	'coverage',
]);

const normalizePath = (root: string, absPath: string): string => {
	const rel = relative(root, absPath).replaceAll('\\', '/');
	return rel.length > 0 ? rel : absPath.replaceAll('\\', '/');
};

const buildUnifiedDiff = (
	path: string,
	before: string,
	after: string,
): string => {
	const beforeLines = before.split('\n');
	const afterLines = after.split('\n');
	const body = [
		...beforeLines.map((line) => `-${line}`),
		...afterLines.map((line) => `+${line}`),
	].join('\n');

	return [
		`--- a/${path}`,
		`+++ b/${path}`,
		`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
		body,
	].join('\n');
};

const walkFiles = async (cwd: string): Promise<readonly string[]> => {
	const results: string[] = [];
	const queue = [cwd];

	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined) {
			continue;
		}

		const entries = await readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const absPath = join(current, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) {
					queue.push(absPath);
				}
				continue;
			}
			if (entry.isFile()) {
				results.push(absPath);
			}
		}
	}

	results.sort();
	return results;
};

export const runCodemod = async (
	request: ICodemodRunRequest,
	deps: ICodemodRunnerDeps = {},
): Promise<ICodemodRunResult> => {
	void request.dryRun;
	const listFiles = deps.listFiles ?? walkFiles;
	const cwd = resolve(request.cwd);
	const reader =
		deps.readFile ??
		(async (path: string) =>
			(
				await new SafeWorkspaceReader(cwd).readText(
					normalizePath(cwd, path),
				)
			).content);

	let discovered: readonly string[];
	try {
		discovered = await listFiles(cwd);
	} catch (error) {
		return {
			ok: false,
			code: 'discover-failed',
			detail: `Cannot discover files under "${cwd}": ${(error as Error).message}`,
		};
	}

	const files: ICodemodFilePlan[] = [];
	let totalEdits = 0;

	for (const candidate of discovered) {
		const absPath = resolve(candidate);
		if (!isSupportedCodemodPath(request.recipe, absPath)) {
			continue;
		}

		let before: string;
		try {
			before = await reader(absPath);
		} catch (error) {
			return {
				ok: false,
				code: 'read-failed',
				detail: `Cannot read "${absPath}": ${(error as Error).message}`,
			};
		}

		const result = request.recipe.apply(absPath, before);
		if (result.edits.length === 0) {
			continue;
		}

		const after = applyCodemodEdits(before, result.edits);
		const path = normalizePath(cwd, absPath);
		files.push({
			path,
			before,
			after,
			diff: buildUnifiedDiff(path, before, after),
			edits: result.edits.length,
		});
		totalEdits += result.edits.length;
	}

	return {
		ok: true,
		files,
		totalEdits,
		language: request.recipe.language,
	};
};
