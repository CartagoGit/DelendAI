import {
	runExternalTool,
	type IExternalTool,
	type IExternalToolRun,
} from '@delendai/core/public';

import type { ICommitPolicyPush } from '../contracts/options';

const GIT_TOOL: IExternalTool = { id: 'git', bin: 'git' };
const GH_TOOL: IExternalTool = { id: 'gh', bin: 'gh' };
const GLAB_TOOL: IExternalTool = { id: 'glab', bin: 'glab' };

export type {
	BranchProtectionAdapter,
	BranchProtectionRefreshResult,
	BranchProtectionState,
	ForgeProvider,
} from '../contracts/branch-protection-contracts';
import type {
	BranchProtectionAdapter as IBranchProtectionAdapter,
	BranchProtectionRefreshResult,
	BranchProtectionState,
	ForgeProvider,
	ForgeProviderResolver,
	SupportedRemoteRepository,
} from '../contracts/branch-protection-contracts';

export interface BranchProtectionAdapterOptions {
	readonly workspaceRoot: string;
	readonly policy: ICommitPolicyPush;
	/** Optional host resolver for self-hosted forge installations. */
	readonly resolveProvider?: ForgeProviderResolver;
	readonly exec?: (
		input: Parameters<typeof runExternalTool>[0],
	) => Promise<IExternalToolRun>;
}

interface RemoteRepository {
	readonly remoteName: string;
	readonly remoteHost: string;
	readonly provider: ForgeProvider;
	readonly owner: string;
	readonly repository: string;
}

interface RemoteTarget {
	readonly name: string;
	readonly url: string;
}

const trimOrUndefined = (value: string): string | undefined => {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const parseUpstreamRemoteName = (value: string): string | undefined => {
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed === '@{upstream}') return undefined;
	if (trimmed.includes('://') || trimmed.startsWith('git@')) return undefined;
	const slash = trimmed.indexOf('/');
	if (slash <= 0) return undefined;
	return trimmed.slice(0, slash);
};

const readRemoteUrl = async (
	workspaceRoot: string,
	remoteName: string,
	exec: NonNullable<BranchProtectionAdapterOptions['exec']>,
): Promise<IExternalToolRun> =>
	exec({
		tool: GIT_TOOL,
		args: ['remote', 'get-url', remoteName],
		cwd: workspaceRoot,
	});

const resolveRemoteTarget = async (
	options: BranchProtectionAdapterOptions,
	exec: NonNullable<BranchProtectionAdapterOptions['exec']>,
): Promise<
	| { readonly ok: true; readonly target: RemoteTarget }
	| {
			readonly ok: false;
			readonly state: 'error';
			readonly reason: string;
			readonly remoteName?: string;
	  }
> => {
	const configuredRemote = options.policy.remote?.trim();
	if (configuredRemote !== undefined && configuredRemote.length > 0) {
		const configuredResult = await readRemoteUrl(
			options.workspaceRoot,
			configuredRemote,
			exec,
		);
		if (!configuredResult.ok) {
			return {
				ok: false,
				state: 'error',
				remoteName: configuredRemote,
				reason:
					configuredResult.stderr.trim() ||
					`Could not read configured remote '${configuredRemote}'.`,
			};
		}
		const remoteUrl = trimOrUndefined(configuredResult.stdout);
		if (remoteUrl === undefined) {
			return {
				ok: false,
				state: 'error',
				remoteName: configuredRemote,
				reason: `Configured remote '${configuredRemote}' has no URL.`,
			};
		}
		return {
			ok: true,
			target: { name: configuredRemote, url: remoteUrl },
		};
	}

	const upstreamResult = await exec({
		tool: GIT_TOOL,
		args: ['rev-parse', '--abbrev-ref', '@{upstream}'],
		cwd: options.workspaceRoot,
	});
	const upstreamRemote = upstreamResult.ok
		? parseUpstreamRemoteName(upstreamResult.stdout)
		: undefined;
	if (upstreamRemote !== undefined) {
		const upstreamUrlResult = await readRemoteUrl(
			options.workspaceRoot,
			upstreamRemote,
			exec,
		);
		if (upstreamUrlResult.ok) {
			const remoteUrl = trimOrUndefined(upstreamUrlResult.stdout);
			if (remoteUrl !== undefined) {
				return {
					ok: true,
					target: { name: upstreamRemote, url: remoteUrl },
				};
			}
		}
	}

	const originResult = await readRemoteUrl(
		options.workspaceRoot,
		'origin',
		exec,
	);
	if (!originResult.ok) {
		return {
			ok: false,
			state: 'error',
			reason:
				originResult.stderr.trim() ||
				'Could not resolve a remote URL from push.remote, upstream or origin.',
			...(upstreamRemote !== undefined
				? { remoteName: upstreamRemote }
				: {}),
		};
	}
	const originUrl = trimOrUndefined(originResult.stdout);
	if (originUrl === undefined) {
		return {
			ok: false,
			state: 'error',
			remoteName: 'origin',
			reason: 'The origin remote is empty or missing.',
		};
	}
	return {
		ok: true,
		target: { name: 'origin', url: originUrl },
	};
};

const parseRemoteRepository = (
	remoteName: string,
	remoteUrl: string,
	resolveProvider: ForgeProviderResolver = (host) =>
		host === 'github.com'
			? 'github'
			: host === 'gitlab.com'
				? 'gitlab'
				: 'unknown',
): RemoteRepository | undefined => {
	const trimmed = remoteUrl.trim().replace(/\.git$/u, '');
	const ssh = trimmed.match(/^git@([^:]+):(.+)$/u);
	const https = trimmed.match(/^https?:\/\/([^/]+)\/(.+)$/u);
	const match = ssh ?? https;
	if (match === null) return undefined;
	const remoteHost = match[1]?.toLowerCase();
	const path = match[2];
	if (remoteHost === undefined || path === undefined) return undefined;
	const segments = path.split('/').filter((segment) => segment.length > 0);
	if (segments.length < 2) return undefined;
	const owner = segments[0];
	const repository = segments.slice(1).join('/');
	if (owner === undefined || repository.length === 0) return undefined;
	return {
		remoteName,
		remoteHost,
		provider: resolveProvider(remoteHost),
		owner,
		repository,
	};
};

const readProtectedBranches = async (
	workspaceRoot: string,
	repository: SupportedRemoteRepository,
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
): IBranchProtectionAdapter => {
	const exec = options.exec ?? runExternalTool;
	const localBranches = new Set(options.policy.protectedBranches);
	let remoteBranches = new Set<string>();

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

	const failure = (
		state: Exclude<BranchProtectionState, 'fresh'>,
		reason: string,
		metadata?: {
			readonly provider?: ForgeProvider;
			readonly remoteName?: string;
			readonly remoteHost?: string;
		},
	): BranchProtectionRefreshResult => ({
		ok: false,
		state,
		reason,
		...(metadata?.provider !== undefined
			? { provider: metadata.provider }
			: {}),
		...(metadata?.remoteName !== undefined
			? { remoteName: metadata.remoteName }
			: {}),
		...(metadata?.remoteHost !== undefined
			? { remoteHost: metadata.remoteHost }
			: {}),
		remoteBranches: [...remoteBranches],
		effectiveBranches: applyEffectiveBranches(),
	});

	let lastResult: BranchProtectionRefreshResult = failure(
		'stale',
		'Remote branch protection has not been refreshed yet; local push.protectedBranches remains in effect.',
	);

	const refresh = async (): Promise<BranchProtectionRefreshResult> => {
		remoteBranches = new Set();
		applyEffectiveBranches();
		const target = await resolveRemoteTarget(options, exec);
		if (!target.ok) {
			lastResult = failure(target.state, target.reason, {
				...(target.remoteName !== undefined
					? { remoteName: target.remoteName }
					: {}),
			});
			return lastResult;
		}
		const repository = parseRemoteRepository(
			target.target.name,
			target.target.url,
			options.resolveProvider,
		);
		if (repository === undefined) {
			lastResult = failure(
				'error',
				`Could not parse remote URL for '${target.target.name}'.`,
				{ remoteName: target.target.name },
			);
			return lastResult;
		}
		if (repository.provider === 'unknown') {
			lastResult = failure(
				'unsupported',
				`Unsupported forge provider for remote '${repository.remoteName}' host: ${repository.remoteHost}`,
				{
					provider: repository.provider,
					remoteName: repository.remoteName,
					remoteHost: repository.remoteHost,
				},
			);
			return lastResult;
		}
		const supportedRepository: SupportedRemoteRepository = {
			...repository,
			provider: repository.provider,
		};
		const result = await readProtectedBranches(
			options.workspaceRoot,
			supportedRepository,
			options.exec,
		);
		if (!result.ok) {
			lastResult = failure(
				'error',
				result.stderr.trim() ||
					`${repository.provider} protection query failed`,
				{
					provider: repository.provider,
					remoteName: repository.remoteName,
					remoteHost: repository.remoteHost,
				},
			);
			return lastResult;
		}
		remoteBranches = new Set(
			parseBranches(repository.provider, result.stdout),
		);
		const effectiveBranches = applyEffectiveBranches();
		lastResult = {
			ok: true,
			state: 'fresh',
			provider: repository.provider,
			remoteName: repository.remoteName,
			remoteHost: repository.remoteHost,
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
