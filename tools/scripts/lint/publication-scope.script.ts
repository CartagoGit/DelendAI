#!/usr/bin/env bun

/**
 * lint:publication-scope — refuse to publish a candidate carrying
 * something that only exists on one machine.
 *
 * WHY, concretely: three open candidates each carried a file named
 * `node_modules` whose content was the absolute path
 * `/home/cartago/_projects/delendai/node_modules`. It was a symlink
 * made in a scratch worktree to share one install, and `git add -A`
 * took it as a blob. Merging any of them would have put a FILE called
 * `node_modules` at the root of the integration branch.
 *
 * The file is not the finding. The finding is that an unclaimed local
 * artifact entered a publication snapshot and then appeared in three
 * independent candidates — so the isolation between "what an agent
 * changed" and "what its machine happens to contain" was not holding.
 * With one agent that is an embarrassment; with fifteen it is how a
 * shared checkout poisons every branch at once.
 *
 * WHAT IT CHECKS: the paths a candidate adds, against a short list of
 * things that cannot legitimately be source. It is deliberately narrow.
 * A scope gate that guesses at intent gets disabled; one that only ever
 * fires on a host path, a dependency tree or a VCS internal is one
 * nobody argues with.
 */

import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/repo-root';

import type { IScopeViolation } from './publication-scope.interface';

export type { IScopeViolation } from './publication-scope.interface';

/**
 * Judge one path.
 *
 * Takes the path AND its blob content, because the case that started
 * this is invisible from the name alone in the general case: a symlink
 * is a file whose content is a path, and it is the content that says
 * which machine it belongs to.
 */
export const judgePath = (input: {
	readonly path: string;
	readonly content?: string | undefined;
}): IScopeViolation | undefined => {
	const path = input.path;
	const content = (input.content ?? '').trim();

	if (path === 'node_modules' || path.includes('/node_modules')) {
		return {
			path,
			code: 'DEPENDENCY_TREE',
			reason: 'a dependency tree is installed, never published — and a FILE by that name breaks every install that follows.',
		};
	}
	if (/^(\/home\/|\/Users\/|\/root\/|[A-Za-z]:\\)/u.test(content)) {
		return {
			path,
			code: 'HOST_ABSOLUTE_PATH',
			reason: `its content is an absolute path on one machine (${content.slice(0, 60)}), which means nothing on any other.`,
		};
	}
	if (path.startsWith('.git/') || path === '.git') {
		return {
			path,
			code: 'VCS_INTERNALS',
			reason: 'git internals are not source.',
		};
	}
	if (/^\.cache\/|^\.vitest-reports\/|^build\/ci\//u.test(path)) {
		return {
			path,
			code: 'LOCAL_ARTIFACT',
			reason: 'a derived artifact of one run, which the next run rebuilds differently.',
		};
	}
	return undefined;
};

/** Every violation in a set of paths. */
export const scopeViolations = (
	entries: readonly { readonly path: string; readonly content?: string }[],
): readonly IScopeViolation[] =>
	entries
		.map((entry) => judgePath(entry))
		.filter((found): found is IScopeViolation => found !== undefined);

const git = (args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: repoRoot(),
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		}).trim();
	} catch {
		return '';
	}
};

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

const main = (): number => {
	const base = arg('base') ?? 'origin/develop';
	const head = arg('head') ?? 'HEAD';
	// ADDED and MODIFIED only. A deleted path has no content to judge
	// and cannot carry anything into the candidate — asking git for it
	// just prints `Not a valid object name` once per removal.
	const paths = git([
		'diff',
		'--name-only',
		'--diff-filter=d',
		`${base}...${head}`,
	])
		.split('\n')
		.filter((line) => line.length > 0);

	const entries = paths.map((path) => ({
		path,
		// Only small blobs are read: a host path is short, and reading a
		// megabyte of source to look for one would make the gate slow
		// enough that somebody turns it off.
		content: git(['cat-file', '-p', `${head}:${path}`]).slice(0, 200),
	}));
	const violations = scopeViolations(entries);

	if (violations.length === 0) {
		console.log(
			`✓ publication-scope: ${paths.length} changed path(s); every one of them is source.`,
		);
		return 0;
	}
	for (const violation of violations) {
		console.error(
			`publication-scope: [${violation.code}] ${violation.path} — ${violation.reason}`,
		);
	}
	console.error(
		'\nA candidate carries what an agent changed, not what its machine contains. Remove these before publishing.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());
