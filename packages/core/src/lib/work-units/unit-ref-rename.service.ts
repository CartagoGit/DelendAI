/**
 * unit-ref-rename.service.ts — a unit of work keeps its commit and changes
 * its name.
 *
 * Two things rename a unit: a claim, which puts a different agent in the
 * name, and the creation of a proposal, which puts its id in the name of a
 * unit that was entered before the id existed. The operation is the same,
 * so it lives here once.
 *
 * ## Why nothing is force-moved
 *
 * The commit does not change. The new name is created, proved to resolve
 * to the same object, the worktree standing on the old name is pointed at
 * the new one, and only then is the old name removed. If a step fails, the
 * old ref is still there and nothing is lost — the ordering is the safety.
 */
import { execFileSync } from 'node:child_process';

import type { IRefRename } from '../contracts/interfaces/unit-ref-rename.interface';
import type { IWorkClaimRefusal } from '../contracts/interfaces/work-claim.interface';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

/** The worktree standing on `ref` (`refs/heads/…`), when there is one. */
const worktreeOn = (root: string, ref: string): string | undefined =>
	git(root, ['worktree', 'list', '--porcelain'])
		.split('\n\n')
		.find((block) => block.split('\n').includes(`branch ${ref}`))
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);

/**
 * Rename `rename.from` to `rename.to`: create the new name, prove it
 * resolves to the same commit, move the worktree, and only then remove
 * the old one. A failed proof leaves both names in place, which is
 * recoverable; deleting first and failing to create is not.
 */
export const renameUnitRef = <T extends IRefRename>(
	root: string,
	rename: T,
): T | IWorkClaimRefusal => {
	const to = `refs/heads/${rename.to}`;
	const from = `refs/heads/${rename.from}`;
	try {
		git(root, ['update-ref', to, rename.sha]);
	} catch (error) {
		return {
			ref: rename.from,
			reason: `could not create ${rename.to}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	// `rev-parse` THROWS for a ref that resolves to nothing — including
	// a ref `update-ref` accepted while pointing it at an object this
	// repository does not have. An unguarded read here turned the
	// proof step into the thing it was proving against.
	let landed = '';
	try {
		landed = git(root, ['rev-parse', to]);
	} catch {
		landed = '';
	}
	if (landed !== rename.sha) {
		return {
			ref: rename.from,
			reason: `${rename.to} resolves to ${landed || 'nothing'}, not ${rename.sha}; the old ref was left alone.`,
		};
	}
	// A worktree standing on the old name follows the work to the new one.
	// Left where it was, it kept the old name alive: the guard refuses to
	// delete a branch a worktree is on, so the rename ended with two names
	// for one unit and the worktree on the one that was meant to go.
	const tree = worktreeOn(root, from);
	if (tree !== undefined) {
		try {
			git(tree, ['symbolic-ref', 'HEAD', to]);
		} catch (error) {
			return {
				ref: rename.from,
				reason: `${rename.to} now holds the work, but the worktree at ${tree} could not be moved onto it: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
	try {
		git(root, ['update-ref', '-d', from, rename.sha]);
	} catch (error) {
		return {
			ref: rename.from,
			// Both names now point at the work. That is untidy and it is
			// not a loss, so it is reported rather than repaired blindly.
			reason: `${rename.to} now holds the work, but ${rename.from} could not be removed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	return rename;
};
