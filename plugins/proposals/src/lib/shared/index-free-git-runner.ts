/**
 * index-free-git-runner.ts — move proposal files without touching the
 * shared index (x00651).
 *
 * `proposal_transition` and the registry sync move a proposal with
 * `git mv`, and `git add` the destination when the source was untracked.
 * In a checkout whose work reaches the integration branch through work
 * refs, that index belongs to nobody: every transition left a staged
 * rename there, and the next agent's commit could sweep it in. Git
 * detects a rename from the content when the move is committed, so
 * nothing is lost by leaving the index alone — and the WIP engine
 * stages through its own private index anyway.
 *
 * The runner keeps the move and drops the staging: `mv` and `rm` act on
 * the working tree only, `add` does nothing, and every other command —
 * the reads the move depends on — goes to git unchanged.
 */
// effect-boundary-authorized: a git-runner adapter; it performs the working-tree half of git mv/rm that the move needs, in place of git.
import { rm } from 'node:fs/promises';

import { safeRename } from '@delendai/core/public';

import type { IGitRunner, IGitRunResult } from './git-runner';

const OK: IGitRunResult = { ok: true, output: '' };

const failed = (error: unknown): IGitRunResult => ({
	ok: false,
	output: '',
	reason: error instanceof Error ? error.message : String(error),
});

/** Paths after a `--` separator or the options, for `rm`/`add`. */
const pathsOf = (args: readonly string[]): readonly string[] => {
	const separator = args.indexOf('--');
	return separator === -1
		? args.slice(1).filter((arg) => !arg.startsWith('-'))
		: args.slice(separator + 1);
};

export const createIndexFreeGitRunner =
	(inner: IGitRunner): IGitRunner =>
	async (args) => {
		const command = args[0];
		if (command === 'mv') {
			const [from, to] = pathsOf(args).slice(-2);
			if (from === undefined || to === undefined) return inner(args);
			return safeRename(from, to).then(() => OK, failed);
		}
		if (command === 'rm') {
			const removals = pathsOf(args).map((path) =>
				rm(path, { force: true }),
			);
			return Promise.all(removals).then(() => OK, failed);
		}
		if (command === 'add') return OK;
		return inner(args);
	};

/**
 * Whether a project's work reaches integration through work refs, so
 * the checkout's index is not the place a move should be recorded. No
 * policy, or one without a work-ref template, keeps git's own staging.
 */
export const movesStayOutOfTheIndex = (
	policy:
		| { readonly branches: { readonly workRefTemplate: string } }
		| undefined,
): boolean => (policy?.branches.workRefTemplate.length ?? 0) > 0;
