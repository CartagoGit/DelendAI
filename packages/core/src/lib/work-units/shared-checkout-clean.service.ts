/**
 * shared-checkout-clean.service.ts — what git says about the shared
 * checkout, for the routes that must not run while it holds loose edits
 * and must not take files from it.
 */
import { DEFAULT_CACHE_DIR } from '../contracts/constants/delendai-records.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	listedPaths,
	looseEditsRefusal,
	sharedCheckoutStaysClean,
	unitsHaveWorktrees,
} from '../development-policy/shared-checkout-clean';
import { gitVerbatim } from '../shared/git-read.helper';
import { worktreeOfRef } from './unit-removal.service';
import { parsePorcelainZ } from './work-dirty-paths.service';
import { mainWorktreeOf } from './work-unit-shared.service';

/**
 * Every path `git status` lists in `root`: staged, unstaged, untracked.
 * delendai's own state directory is not an edit: it ignores itself, and
 * until it has written that file a unit's worktree there is still its.
 */
export const looseEditsOf = (root: string): readonly string[] =>
	parsePorcelainZ(
		gitVerbatim(root, [
			'status',
			'--porcelain=v1',
			'-z',
			'--',
			'.',
			`:(exclude)${DEFAULT_CACHE_DIR}`,
		]) ?? '',
	);

/** The shared checkout of `cwd`'s repository, and the loose edits it holds. */
export const sharedCheckoutLooseEdits = (
	cwd: string,
): { readonly root: string; readonly paths: readonly string[] } => {
	const root = mainWorktreeOf(cwd);
	return { root, paths: looseEditsOf(root) };
};

/**
 * Why a command run from `cwd` must not proceed: the shared checkout of
 * its repository holds loose edits under a policy that keeps it clean.
 * `undefined` when it may.
 */
export const looseSharedCheckoutRefusal = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): { readonly reason: string; readonly remedy: string } | undefined => {
	if (!sharedCheckoutStaysClean(policy)) return undefined;
	const loose = sharedCheckoutLooseEdits(cwd);
	return loose.paths.length === 0
		? undefined
		: looseEditsRefusal(loose.root, loose.paths);
};

/**
 * Why a checkpoint taken from the checkout at `root` takes nothing, under
 * a policy that gives every unit its own worktree: it names each declared
 * file it left and why, and the unit's worktree when `ref` has one.
 * `undefined` when the policy has no unit worktrees.
 */
export const sharedCheckoutCheckpointRefusal = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly paths: readonly string[];
	readonly ref?: string | undefined;
}): { readonly reason: string; readonly remedy: string } | undefined => {
	const { root, policy, paths, ref } = input;
	if (!unitsHaveWorktrees(policy)) return undefined;
	const loose = new Set(looseEditsOf(root));
	const written = paths.filter((path) => loose.has(path));
	const clean = paths.filter((path) => !loose.has(path));
	const left = [
		...(written.length > 0
			? [
					`${listedPaths(written)}: edited here, and nothing proves the unit wrote it — a unit writes in its own worktree`,
				]
			: []),
		...(clean.length > 0
			? [
					`${listedPaths(clean)}: unchanged here, and taking it would put the integration branch's copy over the unit's own work`,
				]
			: []),
	];
	const worktree =
		ref === undefined
			? undefined
			: worktreeOfRef(root, ref.replace(/^refs\/heads\//u, ''));
	return {
		reason: `Nothing is checkpointed from ${root}${ref === undefined ? '' : ` into ${ref.replace(/^refs\/heads\//u, '')}`}: under the \`${policy.profile}\` development profile every unit has its own worktree, and its work reaches its ref by commit there, never from another checkout. Left: ${left.join('; ')}.`,
		remedy:
			worktree === undefined
				? 'Enter the unit (`delendai work enter --proposal=<id> --slice=<slice> --agent=<you>`) and edit and commit in the worktree it prints. Edits already made in the shared checkout: `delendai work rescue` keeps them under a ref, from which the unit takes its own.'
				: `Edit and commit in the unit's worktree, ${worktree}, with git. Edits already made in the shared checkout: \`delendai work rescue\` keeps them under a ref, from which the unit takes its own.`,
	};
};
