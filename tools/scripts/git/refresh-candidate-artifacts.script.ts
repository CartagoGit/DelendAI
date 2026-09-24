#!/usr/bin/env bun
/**
 * refresh-candidate-artifacts — a candidate that is behind is brought up
 * to the integration branch WITH its derived files recomputed.
 *
 * WHY the existing refresh is not enough: `forge:refresh` merges the
 * integration branch into a candidate through a throwaway index, which
 * is what lets it run without moving the shared checkout. A textual
 * merge is the right answer for authored files and the wrong one for
 * derived files — the agent catalog is rendered from the proposals on
 * disk, so merging two versions of it produces a file neither generator
 * would produce, and `catalog:check` fails on the merge result.
 *
 * Measured over one session: six candidates went red on exactly that,
 * and the fix each time was a person running two generators and pushing.
 * That is the definition of work that should not need a person.
 *
 * So this does what the person did: one throwaway worktree per candidate
 * that is behind, merge, regenerate, push. It never touches the shared
 * checkout, never force-pushes, and a candidate whose merge conflicts is
 * reported and left exactly as it was — resolving somebody's conflict is
 * a decision about intent.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import { currentQueueHeadBranch } from '../forge/keep-the-queue-moving.script';
import { repoRoot } from '../lib/repo-root';
import { GENERATED_REFRESH_COMMANDS } from './refresh-candidate-artifacts.constant';

import type { ICandidateRefresh } from './refresh-candidate-artifacts.interface';

export type { ICandidateRefresh } from './refresh-candidate-artifacts.interface';
export { GENERATED_REFRESH_COMMANDS } from './refresh-candidate-artifacts.constant';

const cleanEnvironment = (): NodeJS.ProcessEnv => {
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
	return environment;
};

const git = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: cleanEnvironment(),
		}).trim();
	} catch {
		return undefined;
	}
};

/** Publication refs the integration branch has moved past. */
export const staleCandidates = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	remote: string,
): readonly string[] => {
	const prefix = policy.branches.publicationRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	if (prefix.length === 0) return [];
	const integration = `refs/remotes/${remote}/${policy.branches.integration}`;
	const listed =
		git(root, [
			'for-each-ref',
			'--format=%(refname:short)',
			`refs/remotes/${remote}/${prefix}**`,
		]) ?? '';
	return listed
		.split('\n')
		.map((name) => name.replace(new RegExp(`^${remote}/`, 'u'), ''))
		.filter((name) => name.length > 0)
		.filter((name) => {
			const behind = git(root, [
				'rev-list',
				'--count',
				`${remote}/${name}..${integration}`,
			]);
			return behind !== undefined && Number(behind) > 0;
		});
};

/**
 * Merge, regenerate, push — in a throwaway worktree, so the shared
 * checkout never moves and a failure leaves nothing behind.
 */
export const refreshCandidate = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly candidate: string;
	readonly run?: (command: string, cwd: string) => boolean;
}): ICandidateRefresh => {
	const { root, policy, remote, candidate } = input;
	const dir = mkdtempSync(join(tmpdir(), 'candidate-refresh-'));
	const run =
		input.run ??
		((command: string, cwd: string): boolean => {
			try {
				execFileSync('bun', command.split(' '), {
					cwd,
					stdio: ['ignore', 'ignore', 'pipe'],
					env: cleanEnvironment(),
					timeout: 600_000,
				});
				return true;
			} catch {
				return false;
			}
		});
	try {
		if (
			git(root, [
				'worktree',
				'add',
				'--quiet',
				'--detach',
				dir,
				`${remote}/${candidate}`,
			]) === undefined
		) {
			return { candidate, state: 'failed', detail: 'no worktree' };
		}
		const merged = git(dir, [
			'merge',
			'--no-edit',
			`${remote}/${policy.branches.integration}`,
		]);
		if (merged === undefined) {
			return {
				candidate,
				state: 'conflicted',
				detail: 'does not merge trivially; its author decides',
			};
		}
		const failed = GENERATED_REFRESH_COMMANDS.filter(
			(command) => !run(command, dir),
		);
		if (failed.length > 0) {
			return {
				candidate,
				state: 'failed',
				detail: `generators failed: ${failed.join(', ')}`,
			};
		}
		if ((git(dir, ['status', '--porcelain']) ?? '').length > 0) {
			git(dir, ['add', '-A']);
			git(dir, [
				'-c',
				'core.hooksPath=/dev/null',
				'commit',
				'-m',
				'chore(generated): recompute after refreshing the candidate',
			]);
		}
		const pushed = git(dir, [
			'push',
			remote,
			`HEAD:refs/heads/${candidate}`,
		]);
		return pushed === undefined
			? { candidate, state: 'failed', detail: 'push refused' }
			: {
					candidate,
					state: 'refreshed',
					detail: 'merged and regenerated',
				};
	} finally {
		git(root, ['worktree', 'remove', '--force', dir]);
		rmSync(dir, { recursive: true, force: true });
	}
};

const main = (): void => {
	const root = repoRoot();
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	if (config.development === undefined) return;
	const policy = resolveDevelopmentPolicy({
		development: config.development,
	});
	const remote = process.env.DELENDAI_REMOTE ?? 'origin';
	const apply = process.argv.includes('--apply');
	// Only the head of the queue is brought forward: the candidate that
	// merges next. Bringing every candidate forward on every merge put a
	// merge commit on each of them per merge, and the next merge made
	// each one obsolete. The others wait untouched until their turn.
	let head: string | undefined;
	try {
		head = currentQueueHeadBranch();
	} catch (error) {
		console.log(
			`refresh-candidate-artifacts: the queue could not be read (${error instanceof Error ? error.message : String(error)}); nothing was brought forward.`,
		);
		return;
	}
	const stale = staleCandidates(root, policy, remote).filter(
		(candidate) => candidate === head,
	);
	for (const candidate of stale) {
		if (!apply) {
			console.log(
				`refresh-candidate-artifacts: ${candidate} is behind ${policy.branches.integration} (read-only)`,
			);
			continue;
		}
		const outcome = refreshCandidate({ root, policy, remote, candidate });
		console.log(
			`refresh-candidate-artifacts: ${outcome.candidate} — ${outcome.state}: ${outcome.detail}`,
		);
	}
	console.log(
		`refresh-candidate-artifacts: head of the queue ${head ?? '(none)'}; ${stale.length === 0 ? 'already level' : 'behind'}${apply ? '' : ' — read-only; pass --apply'}.`,
	);
	// The queue arms the head once it is level. It runs on pushes to the
	// integration branch, not to a candidate, so it is asked to run now.
	if (apply && stale.length > 0) {
		try {
			execFileSync(
				'gh',
				[
					'workflow',
					'run',
					'keep-the-queue-moving.yml',
					'--ref',
					policy.branches.integration,
				],
				{ stdio: 'ignore' },
			);
		} catch {
			console.log(
				'refresh-candidate-artifacts: could not ask the queue to run; it arms the head on its next run.',
			);
		}
	}
};

if (import.meta.main) main();
