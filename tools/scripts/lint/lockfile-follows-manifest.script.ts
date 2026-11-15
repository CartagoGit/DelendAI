#!/usr/bin/env bun
/**
 * lockfile-follows-manifest.script.ts — `bun.lock` changes only with a manifest.
 *
 * A bare `bun install` in a worktree rewrites the committed lockfile
 * (it re-resolves duplicates the lock still carried), and the rewrite was
 * committed by accident. A lockfile change is legitimate only when a
 * `package.json` changed with it, so this refuses the other case.
 *
 * Usage:
 *   bun tools/scripts/lint/lockfile-follows-manifest.script.ts --staged
 *   bun tools/scripts/lint/lockfile-follows-manifest.script.ts [--base=<ref>]
 * Without `--staged` it compares HEAD with the merge base of `--base`
 * (default: the pull request's base branch in CI, else origin/develop),
 * and fails when that base cannot be resolved rather than passing blind.
 *
 * Exit codes: 0 consistent, 1 lockfile changed alone, 2 invocation error.
 */
import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/monorepo-paths.ts';

export const LOCKFILE = 'bun.lock';

const isManifest = (path: string): boolean =>
	path === 'package.json' || path.endsWith('/package.json');

/** The paths that break the rule: the lockfile when no manifest changed with it. */
export const lockfileWithoutManifest = (
	changed: readonly string[],
): readonly string[] =>
	changed.includes(LOCKFILE) && !changed.some(isManifest) ? [LOCKFILE] : [];

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
	});

const defaultBase = (): string =>
	process.env.GITHUB_BASE_REF !== undefined &&
	process.env.GITHUB_BASE_REF !== ''
		? `origin/${process.env.GITHUB_BASE_REF}`
		: 'origin/develop';

const changedPaths = (argv: readonly string[]): readonly string[] => {
	const lines = argv.includes('--staged')
		? git(['diff', '--cached', '--name-only'])
		: git([
				'diff',
				'--name-only',
				`${git([
					'merge-base',
					argv.find((a) => a.startsWith('--base='))?.slice(7) ??
						defaultBase(),
					'HEAD',
				]).trim()}`,
				'HEAD',
			]);
	return lines.split('\n').filter((line) => line !== '');
};

const main = (): number => {
	let offenders: readonly string[];
	try {
		offenders = lockfileWithoutManifest(
			changedPaths(process.argv.slice(2)),
		);
	} catch (error) {
		console.error(
			`lockfile-follows-manifest: cannot compare (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); pass --base=<ref> or --staged.`,
		);
		return 2;
	}
	if (offenders.length === 0) {
		console.log('lockfile-follows-manifest: ok');
		return 0;
	}
	console.error(
		`lockfile-follows-manifest: ${offenders.join(', ')} changed without any package.json. Restore it with \`git checkout origin/develop -- ${LOCKFILE}\`; install with \`bun install --frozen-lockfile\`, never a bare \`bun install\`.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());
