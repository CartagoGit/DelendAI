/**
 * unit-activity.helper.ts — when a unit's own work last moved.
 *
 * A unit's tip moves with every merge of the integration branch into it:
 * hydration, the queue refreshing a publication, a batch catching up. Dated
 * by its tip, a unit nobody touches for days read as alive, and an empty
 * one could not be retired as stale. What dates a unit is its own work: the
 * latest commit on it that is not a merge and is not on the integration
 * branch. A unit with none of its own is dated by the first commit it
 * holds beyond the integration branch (when it was first touched); one
 * holding nothing beyond it is dated by its tip.
 */

import type { IGitRead } from '../contracts/interfaces/git-runner.interface';

const epoch = (text: string): number | undefined => {
	const value = Number(text.trim().split('\n')[0]);
	return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** Seconds since the epoch of `ref`'s own last activity, or nothing. */
export const ownActivityAt = (
	git: IGitRead,
	ref: string,
	integration: string,
): number | undefined => {
	const range = `${integration}..${ref}`;
	const own = epoch(git(['log', '-1', '--no-merges', '--format=%ct', range]));
	if (own !== undefined) return own;
	const first = epoch(git(['log', '--reverse', '--format=%ct', range]));
	if (first !== undefined) return first;
	return epoch(git(['log', '-1', '--format=%ct', ref]));
};
