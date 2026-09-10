/**
 * github-forge.ts — the GitHub implementation of `IIntegrationForge`,
 * shelling out through the `gh` CLI on the SAME seam the governance
 * broker uses (`forge-governance/github-adapter.ts`).
 *
 * Reusing that seam is deliberate: `gh` resolves credentials inside the
 * child process, so this file authenticates without ever seeing a token,
 * no argv carries a secret, and every provider string is redacted before
 * it can reach a result. Adding a second way to talk to GitHub would have
 * meant re-earning all three.
 *
 * Writes are OFF unless the caller opts in with `mutationsEnabled`. A
 * read-only adapter can therefore drive the entire cycle against a real
 * repository — opening nothing, merging nothing, deleting nothing.
 *
 * ONE HONEST LIMIT, stated rather than hidden. GitHub's merge API
 * compare-and-swaps on the pull request's HEAD (`sha`) but offers no
 * equivalent for the BASE. So the base half of the swap is performed here
 * — re-read the branch tip immediately before the call and refuse when it
 * is not what was validated — and it is a narrow window, not an atomic
 * guarantee. `requireLatestIntegration` remains enforceable because a
 * merge that slips through the window still lands on a head this engine
 * observed; branch protection (`requiredChecks`) is what closes it
 * completely, and that is exactly what forge-governance reconciles.
 */

import type {
	IExternalTool,
	IExternalToolRun,
} from '../contracts/interfaces/external-tool.interface';
import { runExternalTool } from '../external-tool/run-external-tool';
import type { IGhExec } from '../forge-governance/github-adapter';
import { parseJsonObject } from '../forge-governance/github-live-read';
import { safeProviderMessage } from '../forge-governance/redact-secrets';
import type {
	IDeleteBranchRequest,
	IFindPullRequestRequest,
	IForgeBranchHead,
	IForgeCheck,
	IForgeChecksReport,
	IForgeMergeResult,
	IForgeWriteResult,
	IIntegrationForge,
	IMergePullRequestRequest,
	IOpenPullRequestRequest,
	IReadChecksRequest,
	IReadHeadRequest,
} from './forge-port';
import type {
	IIntegrationPullRequest,
	IIntegrationRepositoryRef,
} from './types';

const GH_TOOL: IExternalTool = { id: 'gh', bin: 'gh' };

/** Construction options, mirroring the governance adapter's. */
export interface IGithubIntegrationForgeOptions {
	readonly cwd?: string;
	/** Writes are refused unless this is explicitly true. */
	readonly mutationsEnabled?: boolean;
	readonly exec?: IGhExec;
	readonly timeoutMs?: number;
}

const repoPath = (target: IIntegrationRepositoryRef): string =>
	`repos/${target.owner}/${target.repository}`;

const reasonOf = (run: IExternalToolRun, fallback: string): string => {
	if (run.unavailable) return 'The gh CLI is not installed on PATH.';
	if (run.timedOut) return 'The gh CLI timed out.';
	const stderr = safeProviderMessage(run.stderr);
	return stderr.length > 0 ? stderr : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const asString = (value: unknown): string =>
	typeof value === 'string' ? value : '';

const asNumber = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** GitHub's check-run status/conclusion pair, flattened to our vocabulary. */
const checkState = (
	status: string,
	conclusion: string,
): IForgeCheck['state'] => {
	if (status !== 'completed')
		return status === 'in_progress' ? 'in_progress' : 'queued';
	if (conclusion === 'success') return 'success';
	if (conclusion === 'neutral' || conclusion === 'skipped') return 'neutral';
	if (conclusion === 'cancelled') return 'cancelled';
	if (conclusion === 'timed_out') return 'timed_out';
	return 'failure';
};

const pullRequestState = (
	body: Record<string, unknown>,
): IIntegrationPullRequest['state'] => {
	if (asString(body.merged_at).length > 0) return 'merged';
	if (body.draft === true) return 'draft';
	return asString(body.state) === 'closed' ? 'closed' : 'open';
};

/** Create the GitHub integration forge. */
export const createGithubIntegrationForge = (
	options: IGithubIntegrationForgeOptions = {},
): IIntegrationForge => {
	const exec: IGhExec = options.exec ?? ((input) => runExternalTool(input));
	const mutationsEnabled = options.mutationsEnabled === true;

	const api = async (
		args: readonly string[],
		stdin?: string,
	): Promise<IExternalToolRun> =>
		exec({
			tool: GH_TOOL,
			args: ['api', '-H', 'Accept: application/vnd.github+json', ...args],
			...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
			timeoutMs: options.timeoutMs ?? 30_000,
			...(stdin !== undefined ? { stdin } : {}),
		});

	const get = async (path: string): Promise<unknown> => {
		const run = await api(['--method', 'GET', path]);
		if (!run.ok) return undefined;
		try {
			return JSON.parse(run.stdout) as unknown;
		} catch {
			return undefined;
		}
	};

	const write = async (
		method: 'POST' | 'PUT' | 'DELETE',
		path: string,
		payload?: Readonly<Record<string, unknown>>,
	): Promise<{
		readonly run?: IExternalToolRun;
		readonly refused: string;
	}> => {
		if (!mutationsEnabled) {
			return {
				refused:
					'This GitHub integration forge is read-only; construct it with mutationsEnabled to write.',
			};
		}
		const run =
			payload === undefined
				? await api(['--method', method, path])
				: await api(
						['--method', method, path, '--input', '-'],
						JSON.stringify(payload),
					);
		return { run, refused: '' };
	};

	const approvalsOf = async (
		target: IIntegrationRepositoryRef,
		number: number,
	): Promise<number> => {
		const reviews = await get(
			`${repoPath(target)}/pulls/${String(number)}/reviews`,
		);
		if (!Array.isArray(reviews)) return 0;
		const latest = new Map<string, string>();
		for (const entry of reviews) {
			const review = asRecord(entry);
			if (review === undefined) continue;
			const user = asRecord(review.user);
			latest.set(
				asString(user?.login),
				asString(review.state).toUpperCase(),
			);
		}
		return [...latest.values()].filter((state) => state === 'APPROVED')
			.length;
	};

	const toPullRequest = async (
		target: IIntegrationRepositoryRef,
		body: Record<string, unknown>,
	): Promise<IIntegrationPullRequest> => {
		const number = asNumber(body.number);
		const head = asRecord(body.head);
		const base = asRecord(body.base);
		const mergeSha = asString(body.merge_commit_sha);
		return {
			number,
			headBranch: asString(head?.ref),
			baseBranch: asString(base?.ref),
			headSha: asString(head?.sha),
			state: pullRequestState(body),
			...(mergeSha.length > 0 ? { mergeSha } : {}),
			approvals: await approvalsOf(target, number),
		};
	};

	const readIntegrationHead = async (
		request: IReadHeadRequest,
	): Promise<IForgeBranchHead | undefined> => {
		const body = asRecord(
			await get(
				`${repoPath(request.target)}/git/ref/heads/${encodeURIComponent(request.branch)}`,
			),
		);
		const sha = asString(asRecord(body?.object)?.sha);
		return sha.length > 0 ? { branch: request.branch, sha } : undefined;
	};

	const findPullRequest = async (
		request: IFindPullRequestRequest,
	): Promise<IIntegrationPullRequest | undefined> => {
		const list = await get(
			`${repoPath(request.target)}/pulls?state=all&base=${encodeURIComponent(request.baseBranch)}&head=${encodeURIComponent(`${request.target.owner}:${request.headBranch}`)}`,
		);
		if (!Array.isArray(list) || list.length === 0) return undefined;
		const open = list
			.map(asRecord)
			.filter(
				(body): body is Record<string, unknown> => body !== undefined,
			);
		const chosen =
			open.find((body) => asString(body.state) === 'open') ?? open[0];
		return chosen === undefined
			? undefined
			: toPullRequest(request.target, chosen);
	};

	return {
		provider: 'github',
		mutationsEnabled,
		readIntegrationHead,
		findPullRequest,

		openPullRequest: async (request: IOpenPullRequestRequest) => {
			const attempt = await write(
				'POST',
				`${repoPath(request.target)}/pulls`,
				{
					title: request.title,
					body: request.body,
					head: request.headBranch,
					base: request.baseBranch,
				},
			);
			if (attempt.run === undefined || !attempt.run.ok) return undefined;
			const body = parseJsonObject(attempt.run.stdout);
			return body === undefined
				? undefined
				: toPullRequest(
						request.target,
						body as unknown as Record<string, unknown>,
					);
		},

		readChecks: async (
			request: IReadChecksRequest,
		): Promise<IForgeChecksReport> => {
			const runs = asRecord(
				await get(
					`${repoPath(request.target)}/commits/${request.sha}/check-runs`,
				),
			);
			const entries = Array.isArray(runs?.check_runs)
				? (runs.check_runs as unknown[])
				: [];
			const checks: IForgeCheck[] = entries
				.map(asRecord)
				.filter(
					(body): body is Record<string, unknown> =>
						body !== undefined,
				)
				.map((body) => ({
					name: asString(body.name),
					state: checkState(
						asString(body.status),
						asString(body.conclusion),
					),
				}));
			const combined = asRecord(
				await get(
					`${repoPath(request.target)}/commits/${request.sha}/status`,
				),
			);
			const state = asString(combined?.state);
			const aggregate =
				state === 'success'
					? ('green' as const)
					: state === 'failure' || state === 'error'
						? ('red' as const)
						: undefined;
			return {
				sha: request.sha,
				checks,
				...(aggregate === undefined ? {} : { aggregate }),
			};
		},

		mergePullRequest: async (
			request: IMergePullRequestRequest,
		): Promise<IForgeMergeResult> => {
			// The base half of the compare-and-swap — see the file header.
			const current = await readIntegrationHead({
				target: request.target,
				branch: request.baseBranch,
			});
			if (current === undefined) {
				return {
					status: 'failed',
					mergeSha: '',
					integrationSha: '',
					reason: 'The base branch tip could not be read, so the merge was not attempted.',
				};
			}
			if (current.sha !== request.expectedBaseSha) {
				return {
					status: 'stale-base',
					mergeSha: '',
					integrationSha: current.sha,
					reason: `The base moved from ${request.expectedBaseSha} to ${current.sha} before the merge.`,
				};
			}
			const attempt = await write(
				'PUT',
				`${repoPath(request.target)}/pulls/${String(request.number)}/merge`,
				{ sha: request.expectedHeadSha, merge_method: request.method },
			);
			if (attempt.run === undefined) {
				return {
					status: 'failed',
					mergeSha: '',
					integrationSha: current.sha,
					reason: attempt.refused,
				};
			}
			if (!attempt.run.ok) {
				const message = reasonOf(attempt.run, 'The merge was refused.');
				const stale = /head branch was modified|sha.*not match/iu.test(
					message,
				);
				return {
					status: stale ? 'stale-head' : 'not-mergeable',
					mergeSha: '',
					integrationSha: current.sha,
					reason: message,
				};
			}
			const body = asRecord(
				parseJsonObject(attempt.run.stdout) as unknown,
			);
			const mergeSha = asString(body?.sha);
			const after = await readIntegrationHead({
				target: request.target,
				branch: current.branch,
			});
			return {
				status: 'merged',
				mergeSha,
				integrationSha: after?.sha ?? mergeSha,
				reason: '',
			};
		},

		deleteBranch: async (
			request: IDeleteBranchRequest,
		): Promise<IForgeWriteResult> => {
			const attempt = await write(
				'DELETE',
				`${repoPath(request.target)}/git/refs/heads/${request.branch}`,
			);
			if (attempt.run === undefined)
				return { ok: false, reason: attempt.refused };
			return attempt.run.ok
				? { ok: true, reason: '' }
				: {
						ok: false,
						reason: reasonOf(
							attempt.run,
							`The branch '${request.branch}' was not deleted.`,
						),
					};
		},
	};
};
