#!/usr/bin/env bun
/**
 * no-tracked-ignored-files.script.ts — x00163.
 *
 * A file whose own path matches a `.gitignore` pattern — especially
 * anything named `*.local.*`, whose entire purpose is "never shared" —
 * has no business being committed. Found live in this repo:
 * `.claude/settings.local.json` (tracked across many commits despite
 * `.gitignore` listing it) and `metrics-candidate.json` (a one-shot
 * regenerable metrics snapshot, root-anchored-ignored, committed once
 * anyway). Both meant every clone of this repo carried stale,
 * session-specific noise (in the settings file's case: inconsistent
 * MCP tool-permission strings that silently stopped matching the live
 * tool registry — see x00163's proposal notes) as if it were shared
 * project state.
 *
 * `git ls-files -i --exclude-standard -c` is git's own primitive for
 * exactly this: list tracked (`-c`, cached) files that ALSO match an
 * ignore rule (`-i --exclude-standard`). This script is a thin,
 * testable wrapper: the git call is isolated behind an injectable
 * `listTrackedIgnoredFiles` so the CLI shell can be unit-tested with a
 * fake without needing a live git repo in the test.
 */
import { spawnSync } from 'node:child_process';

import { repoRoot } from '../lib/monorepo-paths';

export type IListTrackedIgnored = (cwd: string) => readonly string[];

/** Default implementation: shells out to `git ls-files`. */
export const gitListTrackedIgnoredFiles: IListTrackedIgnored = (cwd) => {
	const res = spawnSync(
		'git',
		['ls-files', '-i', '--exclude-standard', '-c'],
		{ cwd, encoding: 'utf8' },
	);
	if (res.status !== 0) return [];
	return res.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

export interface INoTrackedIgnoredResult {
	readonly offenders: readonly string[];
	readonly ok: boolean;
}

/** Pure over an injected lister so tests never touch a real git repo. */
export const findTrackedIgnoredFiles = (
	cwd: string,
	listTrackedIgnored: IListTrackedIgnored = gitListTrackedIgnoredFiles,
): INoTrackedIgnoredResult => {
	const offenders = [...listTrackedIgnored(cwd)].sort();
	return { offenders, ok: offenders.length === 0 };
};

export const formatReport = (result: INoTrackedIgnoredResult): string => {
	if (result.ok) {
		return '✓ no-tracked-ignored-files: 0 tracked files match a .gitignore rule.';
	}
	return [
		`✖ no-tracked-ignored-files: ${result.offenders.length} tracked file(s) match a .gitignore rule:`,
		...result.offenders.map((f) => `  ${f}`),
		'  fix: git rm --cached <file> to untrack it (keeps your local copy),',
		'       then commit. If the file should actually be shared, remove',
		'       its .gitignore rule instead.',
	].join('\n');
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const result = findTrackedIgnoredFiles(repoRoot());
	process.stdout.write(`${formatReport(result)}\n`);
	process.exit(result.ok ? 0 : 1);
}
