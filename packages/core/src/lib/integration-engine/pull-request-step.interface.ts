/**
 * Contract shapes for `./pull-request-step`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `pull-request-step.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `pull-request-step.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IIntegrationCandidate, IIntegrationPullRequest } from './types';

/** What to publish, and where it came from. */
export interface IPullRequestStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	/** Commit to publish: the checkpoint's, or a replayed one. */
	readonly sha: string;
	/** True when the history was replayed and is not a fast-forward. */
	readonly replayed: boolean;
	readonly now: number;
}

/** Outcome of publishing plus opening-or-updating the pull request. */
export interface IPullRequestStepResult {
	readonly status: 'opened' | 'updated' | 'unchanged' | 'failed';
	readonly reason: string;
	readonly pullRequest?: IIntegrationPullRequest;
}
