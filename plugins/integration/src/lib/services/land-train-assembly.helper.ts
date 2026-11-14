/**
 * land-train-assembly.helper.ts — a batch is built in a throwaway worktree:
 * the integration tip, then each member merged in order, then the project's
 * normalization and the derived files regenerated once.
 *
 * A conflict in a derived file (a generated catalog, an index, a budget
 * table) is not a decision: the generator is the function from the merged
 * tree to the file, so either side is thrown away by it. A conflict in any
 * other file still leaves the member out. Nothing here names a project:
 * the derived paths, the regeneration and the normalization are given.
 */
// effect-boundary-authorized: the integrator's git adapter; a batch is built by git in a throwaway worktree
import { execFileSync } from 'node:child_process';

import type { ITrainCandidate } from '@delendai/core/cli';

import {
	BATCH_COMMIT_IDENTITY as IDENTITY,
	BATCH_REGENERATION_SUBJECT,
} from '../contracts/constants/integration-pass.constant';
import type { IGitExec } from '../contracts/interfaces/integration-pass.interface';

/** Git in `cwd`, trimmed; throws when git fails. */
export const runGit: IGitExec = (cwd, args, env) =>
	execFileSync('git', [...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...(env === undefined ? {} : { env: { ...process.env, ...env } }),
	}).trim();

const run = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch {
		return undefined;
	}
};

/** `undefined` when git succeeded, else its stderr (or the error text). */
const failureOf = (
	cwd: string,
	args: readonly string[],
): string | undefined => {
	try {
		execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		return undefined;
	} catch (error) {
		const stderr = (error as { stderr?: unknown }).stderr;
		const text =
			typeof stderr === 'string' || Buffer.isBuffer(stderr)
				? String(stderr).trim()
				: '';
		return text.length > 0 ? text : String(error);
	}
};

const conflictedPaths = (dir: string): readonly string[] =>
	(run(dir, ['diff', '--name-only', '--diff-filter=U']) ?? '')
		.split('\n')
		.filter((path) => path.length > 0);

/**
 * Merge one member onto the train. A conflict confined to derived files
 * keeps the train's side of them (the generator rewrites them next) and
 * returns `derived`; any other conflict aborts and returns `conflict`.
 */
const mergeMember = (
	dir: string,
	remote: string,
	member: ITrainCandidate,
	derived: ReadonlySet<string>,
): 'clean' | 'derived' | 'conflict' => {
	if (run(dir, ['fetch', '-q', '--', remote, member.headSha]) === undefined) {
		return 'conflict';
	}
	const message = `Merge pull request #${String(member.number)} from ${member.headRef}`;
	if (
		run(dir, [
			...IDENTITY,
			'merge',
			'--no-ff',
			'-m',
			message,
			member.headSha,
		]) !== undefined
	) {
		return 'clean';
	}
	const conflicted = conflictedPaths(dir);
	if (
		conflicted.length === 0 ||
		conflicted.some((path) => !derived.has(path))
	) {
		run(dir, ['merge', '--abort']);
		return 'conflict';
	}
	run(dir, ['checkout', '--ours', '--', ...conflicted]);
	run(dir, ['add', '--', ...conflicted]);
	if (run(dir, [...IDENTITY, 'commit', '--no-edit']) === undefined) {
		run(dir, ['merge', '--abort']);
		return 'conflict';
	}
	return 'derived';
};

/**
 * Build the train `ref` from `tipSha` and `members`, in order, and push it.
 * Pushes nothing when any member conflicts outside the derived files, or
 * when the regeneration a derived conflict needs fails; returns the members
 * that kept it from being pushed, and the ones whose derived files the
 * train regenerated.
 */
export const assembleTrain = (input: {
	readonly root: string;
	readonly remote: string;
	readonly tipSha: string;
	readonly ref: string;
	readonly members: readonly ITrainCandidate[];
	/** The files a regeneration rebuilds: a conflict in them is resolved. */
	readonly derived: ReadonlySet<string>;
	/** Run the generators in `dir`; false when one failed. */
	readonly regenerate: (dir: string) => boolean;
	/** Run in the merged tree before the regeneration; commits what it changed. */
	readonly normalize?: (
		dir: string,
		commit: (subject: string) => void,
	) => void;
	/** Give `dir` the shared dependencies; false when it could not. */
	readonly linkDependencies?: (dir: string) => boolean;
	/**
	 * A rehearsal: the assembled train is not pushed and its scratch
	 * worktree is kept, returned as `scratch`; the caller judges it and
	 * calls `discardTrain`. Nothing reaches the remote.
	 */
	readonly rehearsal?: boolean;
}): {
	/** The kept worktree of a rehearsal. */
	readonly scratch?: string;
	readonly conflicting: readonly number[];
	readonly regenerated: readonly number[];
	/** Git's stderr when the push was declined: nothing is on the forge. */
	readonly pushFailure?: string;
} => {
	const scratch = execFileSync(
		'mktemp',
		['-d', '-t', 'delendai-train.XXXXXX'],
		{
			encoding: 'utf8',
		},
	).trim();
	const conflicting: number[] = [];
	const regenerated: number[] = [];
	let kept = false;
	try {
		const worktreeFailure = failureOf(input.root, [
			'worktree',
			'add',
			'--quiet',
			'--detach',
			scratch,
			input.tipSha,
		]);
		if (worktreeFailure !== undefined) {
			// Not the members' fault: they stay in the pool.
			return {
				conflicting,
				regenerated,
				pushFailure: `git worktree add failed: ${worktreeFailure}`,
			};
		}
		for (const member of input.members) {
			const outcome = mergeMember(
				scratch,
				input.remote,
				member,
				input.derived,
			);
			if (outcome === 'conflict') conflicting.push(member.number);
			if (outcome === 'derived') regenerated.push(member.number);
		}
		if (conflicting.length > 0) return { conflicting, regenerated };
		input.normalize?.(scratch, (subject) => {
			run(scratch, ['add', '-A']);
			run(scratch, [...IDENTITY, 'commit', '-q', '-m', subject]);
		});
		{
			// Once, after every member is in: a generator run on half a train
			// computes the file from half a tree. ALWAYS, not only after a
			// derived conflict: a member that left the integration branch
			// long ago merges cleanly and still leaves derived files (the
			// skill copies under .github/.claude/.agents) stale against the
			// tip, and the push's drift check then declined every train.
			const linked = input.linkDependencies?.(scratch) ?? true;
			if (!linked || !input.regenerate(scratch)) {
				if (regenerated.length > 0) {
					return { conflicting: [...regenerated], regenerated: [] };
				}
				return {
					conflicting,
					regenerated,
					pushFailure: linked
						? 'regenerating the derived files on the train failed'
						: 'linking the shared dependencies into the train failed',
				};
			}
			if ((run(scratch, ['status', '--porcelain']) ?? '').length > 0) {
				const committed =
					failureOf(scratch, ['add', '-A']) ??
					failureOf(scratch, [
						...IDENTITY,
						'commit',
						'-q',
						'-m',
						BATCH_REGENERATION_SUBJECT,
					]);
				if (committed !== undefined) {
					return {
						conflicting,
						regenerated,
						pushFailure: `committing the regeneration failed: ${committed}`,
					};
				}
			}
		}
		if (input.rehearsal === true) {
			kept = true;
			return { conflicting, regenerated, scratch };
		}
		const pushFailure = failureOf(scratch, [
			'push',
			'-q',
			'--force',
			input.remote,
			`HEAD:refs/heads/${input.ref}`,
		]);
		return pushFailure === undefined
			? { conflicting, regenerated }
			: { conflicting, regenerated, pushFailure };
	} finally {
		if (!kept) discardTrain(input.root, scratch);
	}
};

/** Remove a train's scratch worktree. */
export const discardTrain = (root: string, scratch: string): void => {
	run(root, ['worktree', 'remove', '--force', scratch]);
	run(root, ['worktree', 'prune']);
	// A failed `worktree add` leaves the empty directory `mktemp` made.
	try {
		execFileSync('rm', ['-rf', '--', scratch]);
	} catch {
		// Nothing more to remove.
	}
};
