/**
 * train-assembly.ts — a train is built in a throwaway worktree: the
 * integration tip, then each member merged in order, then the derived
 * files regenerated once when a member conflicted only in them.
 *
 * A conflict in a derived file (a generated catalog, an index, a budget
 * table) is not a decision: the generator is the function from the merged
 * tree to the file, so either side is thrown away by it. Resolving those
 * on each pull request meant bringing it forward on the owner's machine,
 * one at a time, with a local proof each. On the train they are resolved
 * once for all its members, and the train's own full run judges the
 * result. A conflict in any other file still leaves the member out.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ITrainCandidate } from './queue-order.interface';

/** The subject of the commit a train adds when regeneration moved a file. */
export const TRAIN_REGENERATION_SUBJECT =
	'chore(generated): recompute on the merge train';

const IDENTITY = [
	'-c',
	'user.name=merge-train',
	'-c',
	'user.email=merge-train@invalid',
	'-c',
	'core.hooksPath=/dev/null',
] as const;

/**
 * Link the shared checkout's dependencies into `dir` with the same service
 * a unit worktree uses. A scratch worktree has no `node_modules`, and
 * generators run there cannot load the code: one wrote an empty catalog.
 * The service is async and a train is assembled synchronously, so a child
 * runs it; true when `dir` now has the dependencies.
 *
 * WHY link and not skip the per-merge hook: the merges already run with
 * `core.hooksPath` off, so no hook fires per merge. The one run that needs
 * the code is the single regeneration after all merges.
 */
const linkSharedDependenciesInto = (dir: string): boolean => {
	try {
		execFileSync(
			'bun',
			[
				join(
					dirname(fileURLToPath(import.meta.url)),
					'link-train-dependencies.script.ts',
				),
				dir,
			],
			{ stdio: ['ignore', 'ignore', 'pipe'] },
		);
		return true;
	} catch {
		return false;
	}
};

/**
 * The regeneration a train runs once: each of `commands` through `bun` in
 * `dir`, stopping at the first failure. The queue and the rehearsal share
 * it, so the rehearsal regenerates exactly as the live train does.
 */
export const regenerateWith =
	(commands: readonly string[]) =>
	(dir: string): boolean =>
		commands.every((command) => {
			try {
				execFileSync('bun', command.split(' '), {
					cwd: dir,
					stdio: ['ignore', 'ignore', 'pipe'],
					timeout: 600_000,
				});
				return true;
			} catch {
				return false;
			}
		});

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
	const scratch = mkdtempSync(join(tmpdir(), 'delendai-train-'));
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
		{
			// Once, after every member is in: a generator run on half a train
			// computes the file from half a tree. ALWAYS, not only after a
			// derived conflict: a member that left the integration branch
			// long ago merges cleanly and still leaves derived files (the
			// skill copies under .github/.claude/.agents) stale against the
			// tip, and the push's drift check then declined every train.
			const linked = (
				input.linkDependencies ?? linkSharedDependenciesInto
			)(scratch);
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
						TRAIN_REGENERATION_SUBJECT,
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
	rmSync(scratch, { recursive: true, force: true });
};
