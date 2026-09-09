/**
 * commit.ts — the two plumbing calls that turn a tree into a durable ref,
 * shared by checkpointing and by rebasing.
 *
 * `git commit` is deliberately absent from this engine. Porcelain commits
 * read the real index, run hooks, and are defined in terms of HEAD — all
 * three are exactly what must not happen here. `commit-tree` takes a tree
 * and parents and nothing else, and `update-ref` moves a named ref that
 * HEAD does not point at, so together they persist work without the
 * working tree ever learning that anything happened.
 *
 * The identity is passed as environment rather than as `--author`,
 * because `commit-tree` has no `--author` flag and because a WIP
 * checkpoint should be attributable to the agent that wrote it on BOTH
 * the author and committer lines.
 */

import type { IWipAuthor } from './types';
import type { IGitEnvironment, IScopedGitRunner } from './git-command';

/** Author/committer environment for `commit-tree`; empty when unset. */
export const authorEnvironment = (
	author: IWipAuthor | undefined,
): IGitEnvironment => {
	if (author === undefined) return {};
	const name = author.name.trim();
	const email = author.email.trim();
	if (name.length === 0 || email.length === 0) return {};
	return {
		GIT_AUTHOR_NAME: name,
		GIT_AUTHOR_EMAIL: email,
		GIT_COMMITTER_NAME: name,
		GIT_COMMITTER_EMAIL: email,
	};
};

/** Arguments for `createCommit`. */
export interface ICreateCommitOptions {
	readonly tree: string;
	readonly parents: readonly string[];
	readonly message: string;
	readonly author?: IWipAuthor;
}

/**
 * `git commit-tree <tree> [-p <parent>…] -m <message>`. Returns the new
 * commit id, or `undefined` when git refused (reported by the caller as a
 * failed checkpoint rather than thrown).
 */
export const createCommit = async (
	run: IScopedGitRunner,
	options: ICreateCommitOptions,
): Promise<string | undefined> => {
	const args = ['commit-tree', options.tree];
	for (const parent of options.parents) args.push('-p', parent);
	args.push('-m', options.message);
	const result = await run(args, authorEnvironment(options.author));
	const sha = result.output.trim();
	return result.ok && /^[0-9a-f]{40}$/u.test(sha) ? sha : undefined;
};

/**
 * `git update-ref <ref> <new> [<expected-old>]`, compare-and-swap when an
 * old value is known. Two agents recovering the same abandoned ref at the
 * same moment must not silently lose one of the two updates, so the
 * expected old value is always supplied when there is one.
 */
export const updateRef = async (
	run: IScopedGitRunner,
	ref: string,
	newSha: string,
	expectedOldSha: string | undefined,
): Promise<{ readonly ok: boolean; readonly reason?: string }> => {
	const args = ['update-ref', ref, newSha];
	// The empty string is git's own spelling of "this ref must not exist".
	args.push(expectedOldSha ?? '');
	const result = await run(args);
	return result.ok
		? { ok: true }
		: { ok: false, reason: result.reason ?? 'git update-ref failed' };
};
