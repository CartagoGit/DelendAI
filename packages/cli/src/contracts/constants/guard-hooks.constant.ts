import type { IGuardHookName } from '@delendai/core/cli';

/** The hooks `delendai guard install` writes the policy guard into. */
export const GUARDED_HOOKS: readonly IGuardHookName[] = [
	'pre-commit',
	// Judges the same commit again. Hook managers skip `pre-commit` when
	// nothing is staged (lefthook does), so an empty commit, a review
	// claim, reached the integration branch past it; git runs
	// `commit-msg` for every commit.
	'commit-msg',
	'reference-transaction',
	'pre-push',
	// Git offers no veto before a checkout, so this one never refuses: it
	// says, at the moment it happens, that the shared checkout left the
	// integration node, and how to get back.
	'post-checkout',
	// A merge that resolved a generated file mid-tree leaves it computed
	// from an incomplete tree; this is where the finished tree is (x00559).
	'post-merge',
];
