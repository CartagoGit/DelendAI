/**
 * Contract shapes for `./cleanup-step`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `cleanup-step.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `cleanup-step.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IIntegrationCandidate,
	IIntegrationPullRequest,
	IWorkRefDisposition,
	IWorkRefEvidence,
} from './types';

/** What is known about the candidate at cleanup time. */
export interface ICleanupStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	readonly pullRequest?: IIntegrationPullRequest;
	/** Merge commit the forge produced, if any. */
	readonly mergeSha: string;
	/** Sha the state model recorded, if any. */
	readonly integratedSha: string;
	/** Integration head after the merge, used for the ancestry proof. */
	readonly integrationHeadSha: string;
	/** Commit the work ref is expected to point at. */
	readonly wipHeadSha: string;
}
