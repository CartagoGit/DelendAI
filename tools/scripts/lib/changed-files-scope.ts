/**
 * changed-files-scope.ts — the files a lint that judges files one by one
 * judges, when it runs for a change.
 *
 * A pull request and the local proof set `DELENDAI_CHANGED_FILES` to the
 * files the change touched (a JSON array or one path a line). A lint whose
 * verdict on a file depends on that file alone then judges those files and
 * not the repository: an unchanged file kept the verdict it had on the
 * integration branch, which is green. With the variable unset, as on a push
 * to the integration branch, every lint judges everything.
 *
 * A change that deletes or renames a file widens the run to the repository:
 * a file nobody changed can depend on one that went away.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The environment variable a run for a change sets. */
export const CHANGED_FILES_ENV = 'DELENDAI_CHANGED_FILES';

/** The paths a value of `DELENDAI_CHANGED_FILES` names. Pure. */
export const parseChangedFiles = (value: string): readonly string[] => {
	const trimmed = value.trim();
	if (trimmed.startsWith('[')) {
		// A value starting with `[` parses to an array or throws.
		return (JSON.parse(trimmed) as readonly unknown[]).filter(
			(each): each is string => typeof each === 'string',
		);
	}
	return trimmed
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

/**
 * The changed files to judge, or `undefined` for the whole repository: no
 * change list, an unreadable one, or one that names a path no longer there.
 */
export const changedFilesScope = (
	root: string,
	env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> | undefined => {
	const value = env[CHANGED_FILES_ENV];
	if (value === undefined || value.trim().length === 0) return undefined;
	let files: readonly string[];
	try {
		files = parseChangedFiles(value);
	} catch {
		return undefined;
	}
	if (files.length === 0) return undefined;
	if (files.some((file) => !existsSync(join(root, file)))) return undefined;
	return new Set(files);
};

/**
 * `files` narrowed to the change, and a phrase saying which: a lint prints
 * it, so a run over the changed files is never read as one over everything.
 */
export const filesToJudge = <T>(
	files: readonly T[],
	pathOf: (file: T) => string,
	scope: ReadonlySet<string> | undefined,
): { readonly files: readonly T[]; readonly over: string } =>
	scope === undefined
		? { files, over: 'the repository' }
		: {
				files: files.filter((file) => scope.has(pathOf(file))),
				over: `the ${String(scope.size)} changed file(s)`,
			};
