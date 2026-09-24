#!/usr/bin/env bun
/**
 * hydrate-candidates-after-merge — when the integration branch moves
 * here, every candidate that is only behind is brought up to it.
 *
 * WHY it hangs off the merge and not off a schedule: the moment a
 * candidate goes stale is the moment the integration branch moves, and
 * the machine where that happens is the one holding a credential the
 * forge will build with. A cron would find the same work minutes later,
 * on a machine that cannot push as a person.
 *
 * WHY it refuses to be interesting: it runs `forge:refresh --apply`,
 * which builds every tree in a throwaway index, never moves the
 * checkout, never forces, and reports rather than resolves anything that
 * does not merge trivially. This script only decides WHEN that is worth
 * doing, and it decides conservatively:
 *
 *   - only in the repository's main working tree, never in an agent's;
 *   - only when HEAD is the policy's integration branch;
 *   - only when the merge actually moved it.
 *
 * It never fails the hook. A merge has already happened, and a refresh
 * that could not run is a thing to report, not a reason to make somebody
 * think their merge failed.
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from '../lib/repo-root';
import { runExclusively } from './hydration-lock';

/** Git, with the merge's own environment stripped. */
const git = (args: readonly string[], cwd: string): string | undefined => {
	const environment = { ...process.env };
	for (const name of [
		'GIT_DIR',
		'GIT_WORK_TREE',
		'GIT_INDEX_FILE',
		'GIT_PREFIX',
		'GIT_COMMON_DIR',
	]) {
		delete environment[name];
	}
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			env: environment,
		}).trim();
	} catch {
		return undefined;
	}
};

/** True in the repository's main working tree, false in a linked one. */
export const isMainWorktree = (cwd: string): boolean =>
	git(['rev-parse', '--git-dir'], cwd) ===
	git(['rev-parse', '--git-common-dir'], cwd);

/** Why a refresh is not worth running here, or undefined when it is. */
export const skipReason = (input: {
	readonly mainWorktree: boolean;
	readonly branch: string | undefined;
	readonly integration: string;
}): string | undefined => {
	if (!input.mainWorktree) {
		return 'this is an agent worktree; candidates are refreshed from the shared checkout';
	}
	if (input.branch !== input.integration) {
		return `HEAD is on ${input.branch ?? '(detached)'}, not on ${input.integration}`;
	}
	return undefined;
};

/** Where the background hydration writes what it did. */
export const HYDRATION_LOG = '.cache/delendai/hydrate-candidates.log';

/**
 * What bringing the candidates forward runs, in order, with a timeout
 * each. The namespace maintenance is last because it reads the namespace
 * the refresh just finished moving.
 */
export const HYDRATION_STEPS: ReadonlyArray<readonly [string, number]> = [
	['tools/scripts/git/refresh-candidate-artifacts.script.ts', 3_600_000],
	['tools/scripts/git/maintain-ref-namespace.script.ts', 180_000],
];

const main = (): void => {
	const root = repoRoot();
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	if (config.development === undefined) return;
	const policy = resolveDevelopmentPolicy({
		development: config.development,
	});
	const reason = skipReason({
		mainWorktree: isMainWorktree(root),
		branch: git(['symbolic-ref', '--short', '-q', 'HEAD'], root),
		integration: policy.branches.integration,
	});
	if (reason !== undefined) return;
	if (!process.argv.includes('--run')) {
		// Merging, installing and regenerating every candidate takes
		// minutes, and a post-merge hook holds the person's `git pull`
		// until it returns. So the hook starts the work and leaves.
		const log = join(root, HYDRATION_LOG);
		mkdirSync(join(root, '.cache', 'delendai'), { recursive: true });
		const out = openSync(log, 'a');
		spawn(process.execPath, [import.meta.path, '--run'], {
			cwd: root,
			detached: true,
			stdio: ['ignore', out, out],
		}).unref();
		console.log(
			`hydrate-candidates: ${policy.branches.integration} moved here; bringing candidates forward in the background (log: ${HYDRATION_LOG}).`,
		);
		return;
	}
	// One writer brings a candidate forward: merge, install, run every
	// generator, push. `forge:refresh --apply` used to run first and merge
	// every candidate textually; after it nothing was behind any more, so
	// this step found no work and no candidate was ever regenerated (179
	// hydration merges since 2026-09-20, no regeneration commit).
	// One hydration at a time; a second one leaves a note and steps aside,
	// and the holder goes round again for it.
	const lockDir = join(root, '.cache', 'delendai');
	mkdirSync(lockDir, { recursive: true });
	const outcome = runExclusively(lockDir, () => {
		for (const [script, timeout] of HYDRATION_STEPS) {
			try {
				execFileSync('bun', [script, '--apply'], {
					cwd: root,
					stdio: ['ignore', 'inherit', 'inherit'],
					timeout,
				});
			} catch {
				// Never fail: the merge already happened. Say what did not run.
				console.log(
					`hydrate-candidates: ${script} could not complete; run it with --apply when convenient.`,
				);
			}
		}
	});
	if (outcome === 'deferred') {
		console.log(
			'hydrate-candidates: another hydration is running; it will go round again.',
		);
	}
};

if (import.meta.main) main();
