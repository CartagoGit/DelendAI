/**
 * review-unit-tree.service.ts — a reviewer's queue is read from its own
 * unit.
 *
 * A verdict is a commit in the reviewer's unit, and reaches the shared
 * checkout only when the unit's pull request merges. The queue read the
 * shared checkout, so the slice a reviewer had just approved was still
 * waiting for a verdict there, and `review next` handed it straight back:
 * a reviewer that trusted the queue reviewed the same slice for ever.
 */
import { join, relative } from 'node:path';

import type { IGitRunner } from '@delendai/core/contracts';

/** The worktree that has `unit` checked out, if any. */
const worktreeOf = async (
	run: IGitRunner,
	unit: string,
): Promise<string | undefined> => {
	const listed = await run(['worktree', 'list', '--porcelain']);
	if (!listed.ok) return undefined;
	const branch = unit.startsWith('refs/') ? unit : `refs/heads/${unit}`;
	return listed.output
		.split('\n\n')
		.find((block) => block.split('\n').includes(`branch ${branch}`))
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);
};

/**
 * `proposalsDirAbs` as the unit's worktree has it, when the caller names
 * a unit checked out on this machine; unchanged otherwise.
 */
export const proposalsDirOfUnit = async (input: {
	readonly run: IGitRunner;
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly unit: string | undefined;
}): Promise<string> => {
	if (input.unit === undefined) return input.proposalsDirAbs;
	const worktree = await worktreeOf(input.run, input.unit);
	if (worktree === undefined) return input.proposalsDirAbs;
	const inside = relative(input.workspaceRoot, input.proposalsDirAbs);
	// A proposals folder outside the workspace is not the unit's to move.
	if (inside.startsWith('..')) return input.proposalsDirAbs;
	return join(worktree, inside);
};
