/**
 * Contract shapes for `./merge-step`.
 *
 * Extracted from the implementation module so the repo's
 * "types & constants live in contracts" convention holds:
 * `merge-step.ts` keeps the behaviour, this file keeps the shapes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IIntegrationCandidate,
	IIntegrationPullRequest,
	IValidationReport,
} from './types';

/** What the merge attempt is given. */
export interface IMergeStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	readonly pullRequest: IIntegrationPullRequest;
	/** Commit currently carried by the pull request. */
	readonly sha: string;
	/** Integration head this candidate was validated against. */
	readonly baseSha: string;
	readonly now: number;
}
/** Outcome of the critical section. */
export interface IMergeStepResult {
	readonly status:
		| 'merged'
		| 'blocked'
		| 'awaiting-checks'
		| 'awaiting-approval'
		| 'revalidating'
		| 'stale'
		| 'RECOVERY_CONFLICT'
		| 'failed';
	readonly candidateSha: string;
	readonly integrationHeadSha: string;
	readonly reason: string;
	readonly validation?: IValidationReport;
	readonly mergeSha?: string;
	readonly integratedSha?: string;
	readonly conflicts?: readonly string[];
	readonly idempotentReplay: boolean;
}
