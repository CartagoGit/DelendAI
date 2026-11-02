/**
 * fake-forge.ts — an `IIntegrationForge` with no network that still
 * performs REAL merges.
 *
 * The pull request bookkeeping is in memory, because that part is the
 * forge's own ledger and mocking it proves as much as the real thing.
 * The merge is NOT: it is a genuine three-way `read-tree` into a
 * temporary index followed by `commit-tree` and a compare-and-swap
 * `update-ref` in the server repository, so "the integration branch
 * advanced" is a fact about a real ref and "the candidate was replayed
 * onto the new head" is checkable in real history.
 *
 * `beforeMerge` is the hook the race specs need: it fires inside the
 * engine's critical section, immediately before the merge call, which is
 * exactly the window a compare-and-swap exists to close.
 */

import type {
	IForgeCheck,
	IForgeChecksReport,
	IForgeMergeResult,
	IIntegrationForge,
	IIntegrationPullRequest,
} from '@delendai/core/lib/integration-engine/index';

import {
	INTEGRATION_BRANCH,
	type IIntegrationTestRepo,
} from './integration-repo';

/** The fake plus the levers a spec pulls on it. */
export interface IFakeForge {
	readonly forge: IIntegrationForge;
	/** Record a verdict for a candidate sha. */
	readonly setChecks: (sha: string, checks: readonly IForgeCheck[]) => void;
	/** All required checks green for a sha. */
	readonly setGreen: (sha: string) => void;
	/** The required check failing for a sha. */
	readonly setRed: (sha: string) => void;
	/** Approvals reported for a pull request number. */
	readonly setApprovals: (number: number, approvals: number) => void;
	/** Fires inside the critical section, just before the merge. */
	beforeMerge?: (() => void | Promise<void>) | undefined;
	/** Every pull request the fake has ever opened. */
	readonly pullRequests: readonly IIntegrationPullRequest[];
	/** How many times `openPullRequest` was called. */
	readonly openCount: () => number;
	/** How many times a merge actually advanced the branch. */
	readonly mergeCount: () => number;
}

/** The required context the `shared-checkout-pr` profile names. */
export const REQUIRED_CHECK = 'ci-complete';

const green: readonly IForgeCheck[] = [
	{ name: REQUIRED_CHECK, state: 'success' },
];
const red: readonly IForgeCheck[] = [
	{ name: REQUIRED_CHECK, state: 'failure' },
];

interface IMutablePullRequest {
	number: number;
	headBranch: string;
	baseBranch: string;
	headSha: string;
	state: IIntegrationPullRequest['state'];
	mergeSha?: string;
	approvals: number;
}

export const createFakeForge = (repo: IIntegrationTestRepo): IFakeForge => {
	const records: IMutablePullRequest[] = [];
	const checks = new Map<string, readonly IForgeCheck[]>();
	let opened = 0;
	let merged = 0;

	const snapshot = (
		record: IMutablePullRequest,
	): IIntegrationPullRequest => ({
		number: record.number,
		headBranch: record.headBranch,
		baseBranch: record.baseBranch,
		headSha: repo.serverHead(record.headBranch) || record.headSha,
		state: record.state,
		...(record.mergeSha === undefined ? {} : { mergeSha: record.mergeSha }),
		approvals: record.approvals,
	});

	/**
	 * A real three-way merge in the server repository. The server's own
	 * index is scratch space — its HEAD is an unborn branch nobody pushes
	 * to — so the merge is done there rather than in the agent's clone.
	 */
	const performMerge = (
		baseSha: string,
		candidateSha: string,
	): IForgeMergeResult => {
		const mergeBase = repo.server('merge-base', baseSha, candidateSha);
		try {
			repo.server(
				'read-tree',
				'-m',
				'--aggressive',
				mergeBase,
				baseSha,
				candidateSha,
			);
		} catch (error) {
			return {
				status: 'not-mergeable',
				mergeSha: '',
				integrationSha: baseSha,
				reason: String(error),
			};
		}
		return {
			status: 'merged',
			mergeSha: '',
			integrationSha: '',
			reason: '',
		};
	};

	const forge: IIntegrationForge = {
		provider: 'fake',
		mutationsEnabled: true,

		readIntegrationHead: async (request) => {
			const sha = repo.serverHead(request.branch);
			return sha.length > 0 ? { branch: request.branch, sha } : undefined;
		},

		findPullRequest: async (request) => {
			const found = records.find(
				(record) =>
					record.headBranch === request.headBranch &&
					record.baseBranch === request.baseBranch &&
					record.state !== 'closed',
			);
			return found === undefined ? undefined : snapshot(found);
		},

		openPullRequest: async (request) => {
			opened += 1;
			const record: IMutablePullRequest = {
				number: records.length + 1,
				headBranch: request.headBranch,
				baseBranch: request.baseBranch,
				headSha: repo.serverHead(request.headBranch),
				state: 'open',
				approvals: 0,
			};
			records.push(record);
			return snapshot(record);
		},

		readChecks: async (request): Promise<IForgeChecksReport> => ({
			sha: request.sha,
			checks: checks.get(request.sha) ?? [],
		}),

		mergePullRequest: async (request): Promise<IForgeMergeResult> => {
			await fake.beforeMerge?.();
			const record = records.find(
				(entry) => entry.number === request.number,
			);
			if (record === undefined) {
				return {
					status: 'failed',
					mergeSha: '',
					integrationSha: '',
					reason: 'no such pull request',
				};
			}
			const baseSha = repo.serverHead(request.baseBranch);
			if (baseSha !== request.expectedBaseSha) {
				return {
					status: 'stale-base',
					mergeSha: '',
					integrationSha: baseSha,
					reason: `base moved from ${request.expectedBaseSha} to ${baseSha}`,
				};
			}
			const candidateSha = repo.serverHead(record.headBranch);
			if (candidateSha !== request.expectedHeadSha) {
				return {
					status: 'stale-head',
					mergeSha: '',
					integrationSha: baseSha,
					reason: `head moved from ${request.expectedHeadSha} to ${candidateSha}`,
				};
			}
			const attempt = performMerge(baseSha, candidateSha);
			if (attempt.status !== 'merged') return attempt;
			const tree = repo.server('write-tree');
			const parents =
				request.method === 'merge'
					? ['-p', baseSha, '-p', candidateSha]
					: ['-p', baseSha];
			const commit = repo.server(
				'commit-tree',
				tree,
				...parents,
				'-m',
				`${request.method} #${String(record.number)}`,
			);
			repo.server(
				'update-ref',
				`refs/heads/${request.baseBranch}`,
				commit,
				baseSha,
			);
			merged += 1;
			record.state = 'merged';
			record.mergeSha = commit;
			return {
				status: 'merged',
				mergeSha: commit,
				integrationSha: repo.serverHead(request.baseBranch),
				reason: '',
			};
		},

		deleteBranch: async (request) => {
			const sha = repo.serverHead(request.branch);
			if (sha.length === 0) return { ok: true, reason: '' };
			repo.server(
				'update-ref',
				'-d',
				`refs/heads/${request.branch}`,
				sha,
			);
			return { ok: true, reason: '' };
		},
	};

	const fake: IFakeForge = {
		forge,
		setChecks: (sha, value) => checks.set(sha, value),
		setGreen: (sha) => checks.set(sha, green),
		setRed: (sha) => checks.set(sha, red),
		setApprovals: (number, approvals) => {
			const record = records.find((entry) => entry.number === number);
			if (record !== undefined) record.approvals = approvals;
		},
		get pullRequests() {
			return records.map(snapshot);
		},
		openCount: () => opened,
		mergeCount: () => merged,
	};
	return fake;
};

/** Convenience: the integration branch every spec uses. */
export const BASE_BRANCH = INTEGRATION_BRANCH;
