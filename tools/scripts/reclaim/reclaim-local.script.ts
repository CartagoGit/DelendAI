#!/usr/bin/env bun

/**
 * reclaim-local — make the local clone show what the forge shows,
 * without ever deleting something the forge has not seen.
 *
 * WHY: a pull request merges on the forge and the local clone learns
 * nothing. The branch it was published from stays, the remote-tracking
 * ref stays until something prunes it, and after a few days of swarm
 * work the clone is a list of names nobody can tell apart from live
 * work. That is not cosmetic: an agent picking a base from that list
 * picks a dead one.
 *
 * WHAT IT REFUSES TO SEE, which matters more than what it does:
 *
 *   - Anything outside `refs/heads/`. Not "reports and skips" —
 *     INVISIBLE. `refs/stash`, and the checkpoint refs other tools keep
 *     under their own namespaces, never enter the candidate list at
 *     all, so no present or future branch of this code can act on one.
 *     Written after deleting a `refs/codex/turn-diffs/checkpoints/…`
 *     ref by hand, having said in the same breath that it was not mine
 *     to touch.
 *   - Any branch with a commit no remote has. It may be the only copy.
 *   - Any branch a worktree holds. The worktree is removed first, by a
 *     person, or nothing happens.
 *   - The integration and release branches, by name, from the policy.
 *
 * It deletes exactly one thing: a local branch that is fully published
 * AND whose remote counterpart is gone — which is what a merged or
 * closed pull request leaves behind. Every other case keeps the branch.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import { DEFAULT_PROTECTED } from './reclaim-local.constant';
import type {
	ILocalBranch,
	ILocalReclamation,
	ILocalVerdict,
} from './reclaim-local.interface';

export type {
	ILocalBranch,
	ILocalReclamation,
	ILocalRole,
	ILocalVerdict,
} from './reclaim-local.interface';

const APPLY = process.argv.includes('--apply');

/**
 * The whole decision for one branch, as a pure function.
 *
 * Order is the safety property, not a style choice. `protected` is
 * checked first so a policy branch can never fall through to a later
 * rule; `local-only-work` before `live-mirror` so unpublished work is
 * never judged by what the remote happens to show; and the single
 * reapable verdict is last, reachable only when every reason to keep
 * the branch has already been ruled out.
 */
export const classifyLocal = (
	branch: ILocalBranch,
	protectedNames: readonly string[] = DEFAULT_PROTECTED,
): ILocalVerdict => {
	if (protectedNames.includes(branch.name)) {
		return {
			name: branch.name,
			role: 'protected',
			reason: 'the policy names it as an integration or release branch.',
		};
	}
	if (branch.unpublished > 0) {
		return {
			name: branch.name,
			role: 'local-only-work',
			reason: `it carries ${branch.unpublished} commit(s) no remote has, so it may be the only copy.`,
		};
	}
	if (branch.checkedOut) {
		return {
			name: branch.name,
			role: 'in-use',
			reason: 'a worktree has it checked out; remove the worktree first.',
		};
	}
	if (branch.liveOnRemote) {
		return {
			name: branch.name,
			role: 'live-mirror',
			reason: 'its remote counterpart is still there, so the work is still in flight.',
		};
	}
	return {
		name: branch.name,
		role: 'spent-mirror',
		reason: 'every commit on it is already on a remote, and its remote counterpart is gone.',
	};
};

/** One pass over every candidate branch. */
export const reclaimLocal = (
	branches: readonly ILocalBranch[],
	protectedNames: readonly string[] = DEFAULT_PROTECTED,
): ILocalReclamation => {
	const verdicts = branches.map((branch) =>
		classifyLocal(branch, protectedNames),
	);
	return {
		verdicts,
		reapable: verdicts.filter((verdict) => verdict.role === 'spent-mirror'),
		unpublished: verdicts.filter(
			(verdict) => verdict.role === 'local-only-work',
		),
	};
};

/**
 * Whether a local branch still has something on the forge behind it.
 *
 * The branch's own UPSTREAM decides, not its name. Matching by name is
 * the obvious implementation and it is wrong in the one direction that
 * loses work: a local branch published under a different name has no
 * same-named remote, reads as abandoned, and gets reaped while its pull
 * request is open. Caught by pointing a local `delendai/pr/viva` at a
 * live `origin/delendai/pr/test-zones`, which the name check declared
 * gone.
 *
 * Git already tracks this exactly. `%(upstream:track)` says `[gone]`
 * when the upstream ref has been deleted, and says nothing of the sort
 * while it exists. A branch with no upstream at all falls back to the
 * name check, which is all there is to go on.
 */
export const isLiveOnRemote = (input: {
	readonly upstream: string;
	readonly track: string;
	readonly sameNameExists: boolean;
}): boolean => {
	if (input.upstream.length === 0) return input.sameNameExists;
	return !input.track.includes('gone');
};

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	}).trim();

/** The branch names the project's policy protects. */
const protectedBranches = (): readonly string[] => {
	try {
		const parsed = JSON.parse(
			readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
		) as {
			readonly development?: {
				readonly branches?: {
					readonly integration?: string;
					readonly release?: string;
				};
			};
		};
		const declared = [
			parsed.development?.branches?.integration,
			parsed.development?.branches?.release,
		].filter((name): name is string => typeof name === 'string');
		// The declared names are ADDED to the defaults, never swapped
		// for them: a config that omits `release` must not make `main`
		// reapable.
		return [...new Set([...DEFAULT_PROTECTED, ...declared])];
	} catch {
		return DEFAULT_PROTECTED;
	}
};

/**
 * Local branches, and only local branches.
 *
 * `refs/heads` is the whole enumeration. Nothing under `refs/stash`,
 * `refs/codex/…` or any other tool's namespace is read, so nothing
 * downstream can receive one.
 */
const observe = (): readonly ILocalBranch[] => {
	const checkedOut = new Set(
		git(['worktree', 'list', '--porcelain'])
			.split('\n')
			.filter((line) => line.startsWith('branch '))
			.map((line) => line.slice('branch refs/heads/'.length)),
	);
	const remotes = new Set(
		git(['for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/'])
			.split('\n')
			.filter((line) => line.length > 0),
	);
	return git([
		'for-each-ref',
		'--format=%(refname:strip=2)\t%(upstream:short)\t%(upstream:track)',
		'refs/heads/',
	])
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [name = '', upstream = '', track = ''] = line.split('\t');
			return {
				name,
				unpublished: Number(
					git(['rev-list', '--count', name, '--not', '--remotes']),
				),
				liveOnRemote: isLiveOnRemote({
					upstream,
					track,
					sameNameExists: remotes.has(name),
				}),
				checkedOut: checkedOut.has(name),
			};
		});
};

const main = (): number => {
	// Prune first: a remote-tracking ref for a branch the forge deleted
	// is what makes a spent mirror look live. Judging before pruning
	// would keep every branch forever and call it caution.
	git(['fetch', '--prune', '--quiet', 'origin']);

	const report = reclaimLocal(observe(), protectedBranches());
	for (const verdict of report.verdicts) {
		console.log(`  ${verdict.role.padEnd(16)} ${verdict.name}`);
	}

	if (report.unpublished.length > 0) {
		console.log(
			`\nreclaim-local: ${report.unpublished.length} branch(es) carry work no remote has. Left alone:`,
		);
		for (const verdict of report.unpublished) {
			console.log(`  ${verdict.name} — ${verdict.reason}`);
		}
	}

	if (report.reapable.length === 0) {
		console.log('\nreclaim-local: nothing to reap.');
		return 0;
	}
	if (!APPLY) {
		console.log(
			`\nreclaim-local: ${report.reapable.length} branch(es) would be reaped (pass --apply):`,
		);
		for (const verdict of report.reapable) {
			console.log(`  ${verdict.name} — ${verdict.reason}`);
		}
		return 0;
	}
	for (const verdict of report.reapable) {
		git(['branch', '-D', verdict.name]);
		console.log(`reclaim-local: reaped ${verdict.name}.`);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
