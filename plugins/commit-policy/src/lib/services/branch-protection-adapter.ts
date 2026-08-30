import {
	runExternalTool,
	type IExternalTool,
	type IExternalToolRun,
} from '@mcp-vertex/core/public';

import type { ICommitPolicyPush } from '../contracts/options';

const GIT_TOOL: IExternalTool = { id: 'git', bin: 'git' };
const GH_TOOL: IExternalTool = { id: 'gh', bin: 'gh' };
const GLAB_TOOL: IExternalTool = { id: 'glab', bin: 'glab' };

export type ForgeProvider = 'github' | 'gitlab';

export type BranchProtectionRefreshResult =
	| {
			readonly ok: true;
			readonly provider: ForgeProvider;
			readonly remoteBranches: readonly string[];
			readonly effectiveBranches: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly reason: string;
			readonly provider?: ForgeProvider;
	  };

export interface BranchProtectionAdapter {
	refresh(): Promise<BranchProtectionRefreshResult>;
	getLastResult(): BranchProtectionRefreshResult | undefined;
}

export interface BranchProtectionAdapterOptions {
	readonly workspaceRoot: string;
	readonly policy: ICommitPolicyPush;
	readonly exec?: (
		input: Parameters<typeof runExternalTool>[0],
	) => Promise<IExternalToolRun>;
}

interface RemoteRepository {
	readonly provider: ForgeProvider;
	readonly owner: string;
	readonly repository: string;
}

const parseRemoteRepository = (
	remoteUrl: string,
): RemoteRepository | undefined => {
	const trimmed = remoteUrl.trim().replace(/\.git$/u, '');
	const ssh = trimmed.match(/^git@(github\.com|gitlab\.com):([^/]+)\/(.+)$/u);
	const https = trimmed.match(
		/^https?:\/\/(github\.com|gitlab\.com)\/([^/]+)\/(.+)$/u,
	);
	const match = ssh ?? https;
	if (match === null) return undefined;
	const host = match[1];
	const owner = match[2];
	const repository = match[3];
	if (owner === undefined || repository === undefined) return undefined;
	return {
		provider: host === 'github.com' ? 'github' : 'gitlab',
		owner,
		repository,
	};
};

const readProtectedBranches = async (
	workspaceRoot: string,
	repository: RemoteRepository,
	exec: BranchProtectionAdapterOptions['exec'],
): Promise<IExternalToolRun> => {
	const run = exec ?? runExternalTool;
	if (repository.provider === 'github') {
		return run({
			tool: GH_TOOL,
			args: [
				'api',
				`repos/${repository.owner}/${repository.repository}/branches`,
				'--paginate',
				'--slurp',
				'--jq',
				'.[][] | select(.protected == true) | .name',
			],
			cwd: workspaceRoot,
		});
	}
	const project = encodeURIComponent(
		`${repository.owner}/${repository.repository}`,
	);
	return run({
		tool: GLAB_TOOL,
		args: ['api', `projects/${project}/protected_branches`, '--paginate'],
		cwd: workspaceRoot,
	});
};

const parseBranches = (
	provider: ForgeProvider,
	output: string,
): readonly string[] => {
	if (provider === 'github') {
		return output
			.split(/\r?\n/u)
			.map((branch) => branch.trim())
			.filter((branch) => branch.length > 0);
	}
	try {
		const parsed: unknown = JSON.parse(output);
		const pages = Array.isArray(parsed) ? parsed.flat() : [];
		return pages
			.filter(
				(value): value is { name: string } =>
					typeof value === 'object' &&
					value !== null &&
					typeof (value as { name?: unknown }).name === 'string',
			)
			.map((value) => value.name.trim())
			.filter((branch) => branch.length > 0);
	} catch {
		return [];
	}
};

export const createBranchProtectionAdapter = (
	options: BranchProtectionAdapterOptions,
): BranchProtectionAdapter => {
	const exec = options.exec ?? runExternalTool;
	const localBranches = new Set(options.policy.protectedBranches);
	let remoteBranches = new Set<string>();
	let lastResult: BranchProtectionRefreshResult | undefined;

	const applyEffectiveBranches = (): readonly string[] => {
		const effectiveBranches = [
			...new Set([...localBranches, ...remoteBranches]),
		];
		options.policy.protectedBranches.splice(
			0,
			options.policy.protectedBranches.length,
			...effectiveBranches,
		);
		return effectiveBranches;
	};

	const refresh = async (): Promise<BranchProtectionRefreshResult> => {
		remoteBranches = new Set();
		applyEffectiveBranches();
		const remoteResult = await exec({
			tool: GIT_TOOL,
			args: ['remote', 'get-url', 'origin'],
			cwd: options.workspaceRoot,
		});
		const remoteUrl = remoteResult.ok
			? remoteResult.stdout.trim() || undefined
			: undefined;
		const repository =
			remoteUrl === undefined
				? undefined
				: parseRemoteRepository(remoteUrl);
		if (repository === undefined) {
			lastResult = {
				ok: false,
				reason: 'Could not detect a supported GitHub or GitLab origin remote.',
			};
			return lastResult;
		}
		const result = await readProtectedBranches(
			options.workspaceRoot,
			repository,
			options.exec,
		);
		if (!result.ok) {
			lastResult = {
				ok: false,
				provider: repository.provider,
				reason:
					result.stderr.trim() ||
					`${repository.provider} protection query failed`,
			};
			return lastResult;
		}
		remoteBranches = new Set(
			parseBranches(repository.provider, result.stdout),
		);
		const effectiveBranches = applyEffectiveBranches();
		lastResult = {
			ok: true,
			provider: repository.provider,
			remoteBranches: [...remoteBranches],
			effectiveBranches,
		};
		return lastResult;
	};

	return {
		refresh,
		getLastResult: () => lastResult,
	};
};
