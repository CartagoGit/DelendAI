/**
 * Contract shapes for `./rebase-step`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `rebase-step.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `rebase-step.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IIntegrationCandidate } from './types';

/** What to replay, and between which two bases. */
export interface IRebaseStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	/** Commit currently published for this candidate. */
	readonly sha: string;
	readonly oldBase: string;
	readonly newBase: string;
	readonly now: number;
}

/** Outcome of the replay. */
export interface IRebaseOutcome {
	readonly status: 'revalidating' | 'RECOVERY_CONFLICT' | 'failed';
	/** Replayed commit on success; the untouched one otherwise. */
	readonly candidateSha: string;
	readonly conflicts: readonly string[];
	readonly reason: string;
}
