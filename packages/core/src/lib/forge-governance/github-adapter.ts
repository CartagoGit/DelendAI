/**
 * github-adapter.ts — the GitHub implementation of `IForgeProviderAdapter`,
 * shelling out through the `gh` CLI.
 *
 * `gh` rather than raw HTTP because `gh` already owns credential
 * resolution — `GH_TOKEN`, then `GITHUB_TOKEN`, then its own stored login
 * — and it resolves them inside the child process. That is what lets this
 * file authenticate without ever seeing a token: the environment is
 * inherited, no value is read, and no argv ever carries a secret. See
 * `credential-seam.ts` for how a fine-grained runtime token or a GitHub
 * App installation token is substituted later.
 *
 * Writes are OFF unless the caller opts in with `mutationsEnabled`. The
 * exec seam is injectable so tests drive this without a network, and every
 * provider string is redacted before it can reach a result.
 */

import { runExternalTool } from '../external-tool/run-external-tool';
import type {
	IExternalTool,
	IExternalToolRun,
	IRunExternalToolInput,
} from '../contracts/interfaces/external-tool.interface';
import {
	resolveForgeCredentialSeam,
	type IForgeCredentialSeam,
} from './credential-seam';
import type { IForgeRepositoryRef } from './governance-contracts';
import {
	classifyProtectionFailure,
	parseBranchProperties,
	parseJsonObject,
	parseRepositoryProperties,
	unprotectedBranchProperties,
	unreadableBranchProperties,
	unreadableRepositoryProperties,
} from './github-live-read';
import {
	branchProtectionPayload,
	repositorySettingsPayload,
} from './github-payloads';
import type {
	IApplyBranchRuleRequest,
	IApplyRepositorySettingsRequest,
	IForgeMutationResult,
	IForgeProviderAdapter,
	ILiveForgeState,
	IReadLiveStateRequest,
	ILiveValue,
} from './provider-contracts';
import { safeProviderMessage } from './redact-secrets';

import type {
	IGhExec,
	IGithubAdapterOptions,
} from './github-adapter.interface';

export type {
	IGhExec,
	IGithubAdapterOptions,
} from './github-adapter.interface';

const GH_TOOL: IExternalTool = { id: 'gh', bin: 'gh' };

const repoPath = (target: IForgeRepositoryRef): string =>
	`repos/${target.owner}/${target.repository}`;

/** Why a run failed, already redacted and capped. */
const failureReason = (run: IExternalToolRun, fallback: string): string => {
	if (run.unavailable) {
		return 'The gh CLI is not installed on PATH, so no forge property could be read or written.';
	}
	if (run.timedOut) return 'The gh CLI timed out.';
	const stderr = safeProviderMessage(run.stderr);
	return stderr.length > 0 ? stderr : fallback;
};

/**
 * Create a GitHub adapter. `credentialSeam` is exposed for reporting; it
 * describes the mechanism only and can never carry a token value.
 */
export const createGithubForgeAdapter = (
	options: IGithubAdapterOptions = {},
): IForgeProviderAdapter & {
	readonly credentialSeam: IForgeCredentialSeam;
} => {
	const exec: IGhExec = options.exec ?? ((input) => runExternalTool(input));
	const credentialSeam = resolveForgeCredentialSeam(options.env);
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

	const readRepository = async (
		target: IForgeRepositoryRef,
	): Promise<Readonly<Record<string, ILiveValue>>> => {
		const run = await api(['--method', 'GET', repoPath(target)]);
		if (!run.ok) {
			return unreadableRepositoryProperties(
				failureReason(
					run,
					'The repository settings could not be read.',
				),
			);
		}
		const body = parseJsonObject(run.stdout);
		return body === undefined
			? unreadableRepositoryProperties(
					'The gh CLI returned a response that is not a JSON object.',
				)
			: parseRepositoryProperties(body);
	};

	const readBranch = async (
		target: IForgeRepositoryRef,
		branch: string,
	): Promise<Readonly<Record<string, ILiveValue>>> => {
		const run = await api([
			'--method',
			'GET',
			`${repoPath(target)}/branches/${encodeURIComponent(branch)}/protection`,
		]);
		if (!run.ok) {
			// A transport failure tells us nothing about the branch at all.
			if (run.unavailable || run.timedOut) {
				return unreadableBranchProperties(
					branch,
					failureReason(
						run,
						`Branch protection for '${branch}' could not be read.`,
					),
				);
			}
			// Only GitHub's explicit "Branch not protected" is a fact; every
			// other 404 (wrong repo, renamed branch, invisible to this
			// credential) is unreadable, never "unprotected".
			const classified = classifyProtectionFailure(
				run.stdout,
				run.stderr,
			);
			return classified.kind === 'unprotected'
				? unprotectedBranchProperties(branch)
				: unreadableBranchProperties(
						branch,
						`Branch protection for '${branch}': ${classified.reason}`,
					);
		}
		const body = parseJsonObject(run.stdout);
		return body === undefined
			? unreadableBranchProperties(
					branch,
					'The gh CLI returned a response that is not a JSON object.',
				)
			: parseBranchProperties(branch, body);
	};

	const write = async (
		method: 'PUT' | 'PATCH',
		path: string,
		payload: Readonly<Record<string, unknown>>,
	): Promise<IForgeMutationResult> => {
		if (!mutationsEnabled) {
			return {
				ok: false,
				reason: 'This GitHub adapter is read-only; construct it with mutationsEnabled to write.',
			};
		}
		const run = await api(
			['--method', method, path, '--input', '-'],
			JSON.stringify(payload),
		);
		return run.ok
			? { ok: true, reason: '' }
			: {
					ok: false,
					reason: failureReason(run, `${method} ${path} failed.`),
				};
	};

	return {
		provider: 'github',
		mutationsEnabled,
		credentialSeam,
		readLiveState: async (
			request: IReadLiveStateRequest,
		): Promise<ILiveForgeState> => {
			const properties: Record<string, ILiveValue> = {
				...(await readRepository(request.target)),
			};
			for (const branch of request.branches) {
				Object.assign(
					properties,
					await readBranch(request.target, branch),
				);
			}
			return { provider: 'github', properties };
		},
		applyBranchRule: (request: IApplyBranchRuleRequest) =>
			write(
				'PUT',
				`${repoPath(request.target)}/branches/${encodeURIComponent(request.rule.branch)}/protection`,
				branchProtectionPayload(request.rule),
			),
		applyRepositorySettings: (request: IApplyRepositorySettingsRequest) =>
			write(
				'PATCH',
				repoPath(request.target),
				repositorySettingsPayload(request.settings),
			),
	};
};
