/**
 * unit-edit-fence.service.ts — an agent that holds a unit edits inside
 * that unit's worktree, and nowhere else in the repository.
 *
 * The work commands and the commit guard refuse once the shared checkout
 * holds loose edits; a host that can veto an edit before it is made
 * (Claude Code's PreToolUse hook) asks this first, so the edit never
 * lands in the wrong tree. An extra barrier, never the only one (x01003).
 */
import { isAbsolute, relative, resolve } from 'node:path';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { unitsHaveWorktrees } from '../development-policy/shared-checkout-clean';
import { readGit } from '../shared/git-read.helper';

/** True when `path` is `dir` or inside it. */
const within = (dir: string, path: string): boolean => {
	const rel = relative(resolve(dir), resolve(path));
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** Every working tree of the repository `cwd` is in, with its branch. */
const worktreesOf = (
	cwd: string,
): readonly { readonly path: string; readonly branch: string | undefined }[] =>
	(readGit(cwd, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.map((block) => {
			const lines = block.split('\n');
			const path = lines
				.find((line) => line.startsWith('worktree '))
				?.slice('worktree '.length);
			const branch = lines
				.find((line) => line.startsWith('branch refs/heads/'))
				?.slice('branch refs/heads/'.length);
			return { path: path ?? '', branch };
		})
		.filter((tree) => tree.path.length > 0);

/**
 * Why `agent` may not write `path`: it holds a unit, and `path` is in the
 * repository but outside every worktree of its units. `undefined` when the
 * write may go ahead: no unit worktrees under this policy, no unit held,
 * a path inside one of the agent's units, or a path outside the repository.
 */
export const editOutsideUnitRefusal = (input: {
	readonly cwd: string;
	readonly path: string;
	readonly agent: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): { readonly reason: string; readonly remedy: string } | undefined => {
	const { cwd, agent, policy } = input;
	if (agent.length === 0 || !unitsHaveWorktrees(policy)) return undefined;
	const target = resolve(cwd, input.path);
	const trees = worktreesOf(cwd);
	if (!trees.some((tree) => within(tree.path, target))) return undefined;
	const own = trees.filter(
		(tree) =>
			tree.branch !== undefined &&
			workUnitIdentityOf(policy, tree.branch)?.agent === agent,
	);
	if (own.length === 0) return undefined;
	if (own.some((tree) => within(tree.path, target))) return undefined;
	const listed = own.map((tree) => tree.path).join(', ');
	return {
		reason: `${target} is outside the worktree of the unit ${agent} holds (${listed}): under the \`${policy.profile}\` development profile a unit's work is written and committed in its own worktree, and nothing is edited in the shared checkout.`,
		remedy: `Write it under ${own[0]?.path ?? listed} instead, with the same repository-relative path.`,
	};
};
