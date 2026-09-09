/**
 * forge-port.ts — the narrow, TYPED seam between the integration engine
 * and a forge vendor, deliberately shaped like
 * `forge-governance/provider-contracts.ts`.
 *
 * Same reasoning applies here, and one more that is specific to merging:
 * the ONLY merge this port can express is a compare-and-swap. There is no
 * `merge(number)` overload that skips the expected shas, so a caller
 * cannot lose the strict-latest invariant by forgetting an argument — the
 * type system will not let the call be written. A forge that cannot
 * honour the swap must answer `unsupported`, never merge anyway.
 *
 * Reads are always allowed. Writes are refused unless the adapter was
 * constructed with mutations enabled, so a spec — or a dry run — can
 * exercise the whole cycle against a real repository without ever
 * changing it.
 */

import type { MergeMethod } from '../contracts/interfaces/development-policy.interface';
import type {
	IIntegrationPullRequest,
	IIntegrationRepositoryRef,
} from './types';

/** The tip of a branch as the forge currently reports it. */
export interface IForgeBranchHead {
	readonly branch: string;
	readonly sha: string;
}

/** One check context reported for a candidate sha. */
export interface IForgeCheck {
	/** Context name, matched against `policy.integration.requiredChecks`. */
	readonly name: string;
	readonly state:
		| 'queued'
		| 'in_progress'
		| 'success'
		| 'failure'
		| 'cancelled'
		| 'timed_out'
		| 'neutral';
}

/**
 * Everything the forge knows about the checks for one sha. `aggregate`
 * is the forge's own roll-up, used only when the policy names no
 * required contexts ("empty means the forge decides"). Its absence is
 * never a pass — see `validation-step.ts`.
 */
export interface IForgeChecksReport {
	readonly sha: string;
	readonly checks: readonly IForgeCheck[];
	readonly aggregate?: 'green' | 'red' | 'pending';
}

/** Outcome of any forge write. Reasons are human-readable and redacted. */
export interface IForgeWriteResult {
	readonly ok: boolean;
	readonly reason: string;
}

/**
 * Outcome of the compare-and-swap merge.
 *
 * `stale-head` and `stale-base` are separate on purpose: the first means
 * the agent pushed a newer checkpoint while we were validating, the
 * second means somebody else's work landed first. They lead to different
 * recoveries — re-validate this candidate, versus rebase it — and
 * collapsing them into one "conflict" would hide which happened.
 */
export interface IForgeMergeResult {
	readonly status:
		| 'merged'
		| 'stale-head'
		| 'stale-base'
		| 'not-mergeable'
		| 'blocked'
		| 'unsupported'
		| 'failed';
	/** The merge commit, empty unless `merged`. */
	readonly mergeSha: string;
	/** The integration branch tip after the merge, empty unless `merged`. */
	readonly integrationSha: string;
	readonly reason: string;
}

/** Ask the forge for a branch tip. */
export interface IReadHeadRequest {
	readonly target: IIntegrationRepositoryRef;
	readonly branch: string;
}

/** Look a pull request up by the branch pair that identifies it. */
export interface IFindPullRequestRequest {
	readonly target: IIntegrationRepositoryRef;
	readonly headBranch: string;
	readonly baseBranch: string;
}

/** Open a pull request. Only ever called after `findPullRequest` misses. */
export interface IOpenPullRequestRequest extends IFindPullRequestRequest {
	readonly title: string;
	readonly body: string;
}

/** Read the checks recorded for a candidate sha. */
export interface IReadChecksRequest {
	readonly target: IIntegrationRepositoryRef;
	readonly sha: string;
}

/**
 * The compare-and-swap merge. Both expectations are required: the forge
 * must refuse if the pull request's head is no longer `expectedHeadSha`,
 * or if the base branch is no longer at `expectedBaseSha`.
 */
export interface IMergePullRequestRequest {
	readonly target: IIntegrationRepositoryRef;
	readonly number: number;
	/** Branch the pull request merges into. */
	readonly baseBranch: string;
	readonly expectedHeadSha: string;
	readonly expectedBaseSha: string;
	readonly method: MergeMethod;
}

/** Delete the branch a merged candidate was published on. */
export interface IDeleteBranchRequest {
	readonly target: IIntegrationRepositoryRef;
	readonly branch: string;
	/** Commit the branch is expected to point at. */
	readonly expectedSha: string;
}

/** The complete forge surface the integration engine may use. */
export interface IIntegrationForge {
	readonly provider: string;
	/** True when this adapter is permitted to perform writes at all. */
	readonly mutationsEnabled: boolean;
	readIntegrationHead(
		request: IReadHeadRequest,
	): Promise<IForgeBranchHead | undefined>;
	findPullRequest(
		request: IFindPullRequestRequest,
	): Promise<IIntegrationPullRequest | undefined>;
	openPullRequest(
		request: IOpenPullRequestRequest,
	): Promise<IIntegrationPullRequest | undefined>;
	readChecks(request: IReadChecksRequest): Promise<IForgeChecksReport>;
	mergePullRequest(
		request: IMergePullRequestRequest,
	): Promise<IForgeMergeResult>;
	deleteBranch(request: IDeleteBranchRequest): Promise<IForgeWriteResult>;
}
