/**
 * unit-leaves-progress.service.ts — a proposal that leaves in-progress
 * takes its wip branch's work with it.
 *
 * A proposal keeps one wip branch exactly while it is in progress. The
 * commit that moves it out (to review, ready, blocked, paused or done),
 * whoever made it, is the moment what the branch holds has to reach the
 * integration branch, the way the work model integrates: a pull request,
 * a merge through the local gate, or a direct commit for a model without
 * branches. Left to somebody remembering `work publish`, a proposal
 * parked in ready kept its work on a side branch, and a worktree nobody
 * would come back to.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
import { dirname } from 'node:path';

import {
	proposalFileAt,
	proposalInProgress,
} from './publication-target.service';

/**
 * The `work publish` arguments of the unit on `branch`, when its last
 * commit (`HEAD` of `cwd`) moved its proposal out of in-progress.
 */
export const publicationOnLeavingProgress = (input: {
	readonly cwd: string;
	readonly branch: string | undefined;
	readonly inMainWorktree: boolean;
	readonly policy: IResolvedDevelopmentPolicy;
}): readonly string[] | undefined => {
	const { cwd, branch, policy } = input;
	if (input.inMainWorktree || branch === undefined) return undefined;
	const unit = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
		{ requireKind: false },
	)?.parse(`refs/heads/${branch}`);
	if (unit === undefined) return undefined;
	// A commit that moves the unit's proposal to another folder ends the
	// unit's work on it, unless it moved into progress, which starts it.
	// Leaving `in-progress` was the only move that published: a proposal
	// retired from `paused` left its unit holding an unpublished commit.
	const before = proposalFileAt(cwd, unit.proposal, 'HEAD~1');
	const after = proposalFileAt(cwd, unit.proposal, 'HEAD');
	const left =
		before !== undefined &&
		after !== undefined &&
		dirname(before) !== dirname(after) &&
		!proposalInProgress(cwd, unit.proposal, 'HEAD');
	if (!left) return undefined;
	return [
		'publish',
		`--kind=${unit.kind}`,
		`--proposal=${unit.proposal}`,
		`--slice=${unit.slice}`,
		`--agent=${unit.agent}`,
		`--generation=${String(unit.generation)}`,
		...(unit.topic === undefined ? [] : [`--topic=${unit.topic}`]),
	];
};
