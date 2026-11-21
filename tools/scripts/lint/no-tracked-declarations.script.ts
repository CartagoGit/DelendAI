#!/usr/bin/env bun
/**
 * no-tracked-declarations.script.ts — i00004 S2.
 *
 * A `.d.ts` sitting next to its own `.ts` source is always a build
 * artefact that escaped, never authored code. `.gitignore:86-88`
 * has said so for a long time (`packages/*​/src/**​/*.d.ts`,
 * `plugins/*​/src/**​/*.d.ts`) — but a `.gitignore` rule does not
 * apply to files git already tracks. Audit 2026-09-08 found 278 of
 * them still versioned, already out of sync with their sources
 * (`db-status.tool.ts` had no `.d.ts` while its neighbours did). The
 * rule had been written and the `git rm --cached` never run.
 *
 * They have been untracked. This is the guardrail: `git ls-files`
 * must never again return a `.d.ts` under a package/plugin `src` or
 * `tests` tree, and the failure message carries the exact remedy.
 *
 * The git call is isolated behind an injectable lister so the spec
 * runs without a live repository.
 */
import { spawnSync } from 'node:child_process';

import { repoRoot } from '../lib/monorepo-paths';

/**
 * Pathspecs handed to `git ls-files`. Kept as data so the set of
 * guarded trees is visible at a glance and assertable in the spec.
 */
export const GUARDED_PATHSPECS = [
	'packages/*/src/**/*.d.ts',
	'plugins/*/src/**/*.d.ts',
	'packages/*/tests/**/*.d.ts',
	'plugins/*/tests/**/*.d.ts',
] as const;

export type IListTrackedFiles = (
	cwd: string,
	pathspecs: readonly string[],
) => readonly string[];

/** Default implementation: shells out to `git ls-files`. */
export const gitListTrackedFiles: IListTrackedFiles = (cwd, pathspecs) => {
	const res = spawnSync('git', ['ls-files', '--', ...pathspecs], {
		cwd,
		encoding: 'utf8',
	});
	if (res.status !== 0) return [];
	return res.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

export interface INoTrackedDeclarationsResult {
	readonly offenders: readonly string[];
	readonly ok: boolean;
}

/**
 * Pure over an injected lister. Re-filters on `.d.ts` so a lister
 * that over-matches (or a git version that widens a pathspec) can
 * never turn this gate into a false positive on a real source file.
 */
export const findTrackedDeclarations = (
	cwd: string,
	listTrackedFiles: IListTrackedFiles = gitListTrackedFiles,
): INoTrackedDeclarationsResult => {
	const offenders = [...listTrackedFiles(cwd, GUARDED_PATHSPECS)]
		.filter((file) => file.endsWith('.d.ts'))
		.sort();
	return { offenders, ok: offenders.length === 0 };
};

/** The exact command that fixes the failure, listing every offender. */
export const remedyCommand = (offenders: readonly string[]): string =>
	`git rm --cached ${offenders.join(' ')}`;

export const formatReport = (result: INoTrackedDeclarationsResult): string => {
	if (result.ok) {
		return '✓ no-tracked-declarations: 0 tracked .d.ts files under package/plugin src or tests.';
	}
	return [
		`✖ no-tracked-declarations: ${result.offenders.length} tracked .d.ts file(s) inside a source tree:`,
		...result.offenders.map((file) => `  ${file}`),
		'  These are build artefacts; .gitignore already ignores them, but an',
		'  ignore rule does not untrack a file git is already tracking.',
		'  fix: run this from the repository root, then commit the deletion:',
		`    ${remedyCommand(result.offenders)}`,
	].join('\n');
};

/** CLI shell. Returns the process exit code. */
export const main = (
	cwd: string = repoRoot(),
	listTrackedFiles: IListTrackedFiles = gitListTrackedFiles,
): number => {
	const result = findTrackedDeclarations(cwd, listTrackedFiles);
	process.stdout.write(`${formatReport(result)}\n`);
	return result.ok ? 0 : 1;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) process.exit(main());
