/**
 * slice-stage-facts.service.ts — the recorded facts a slice's stage is
 * read from: its document's Status and review-state, its `shipped-in`,
 * and whether that commit is on the integration and release branches.
 *
 * Git is asked once per commit and branch, and only for slices that
 * recorded a delivering commit.
 */
import type { IGitRunner } from '../shared/git-runner';
import { parseReviewState } from '../swarm/proposal-review';
import { readShippingCommit } from '../swarm/slice-shipping-record';
import { sliceStage, type ISliceStage } from '../swarm/slice-stage';

/** A reader of slice stages that remembers what git already answered. */
export const createSliceStageReader = (
	run: IGitRunner | undefined,
	/** The branches a delivered commit is looked for on. */
	branches: {
		readonly integration?: string | undefined;
		readonly release?: string | undefined;
	},
) => {
	const asked = new Map<string, Promise<boolean>>();
	const onBranch = (commit: string, branch: string | undefined) => {
		if (run === undefined || branch === undefined) {
			return Promise.resolve(false);
		}
		const key = `${commit}@${branch}`;
		let answer = asked.get(key);
		if (answer === undefined) {
			answer = run(['merge-base', '--is-ancestor', commit, branch]).then(
				(result) => result.ok,
			);
			asked.set(key, answer);
		}
		return answer;
	};
	return async (status: string, block: string): Promise<ISliceStage> => {
		const commit = readShippingCommit(block);
		return sliceStage({
			status,
			reviewState: parseReviewState(block).status,
			delivered: commit !== undefined,
			proved: false,
			integrated:
				commit !== undefined &&
				(await onBranch(commit, branches.integration)),
			released:
				commit !== undefined &&
				(await onBranch(commit, branches.release)),
		});
	};
};
