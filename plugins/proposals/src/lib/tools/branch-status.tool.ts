import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';

import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import {
	parseBranchList,
	runBranchStatusEngine,
} from '../shared/branch-status-engine';
import {
	DECIMAL_RADIX,
	DEFAULT_STRANDED_BEHIND_THRESHOLD,
	toolJsonWithErrorFlag,
} from '../shared/branch-tool-helpers';
import {
	optionalBoolean,
	optionalString,
	optionalUnknown,
} from '../shared/tool-schema-shortcuts';

export interface IBranchStatusToolOptions {
	readonly namespacePrefix: string;
	/** Absolute repo root. */
	readonly workspaceRoot: string;
	/** Override the git runner (tests). Defaults to `createGitRunner(workspaceRoot)`. */
	readonly run?: IGitRunner;
	/** Default base branch. Default `develop`. */
	readonly defaultBaseBranch?: string;
	/** Default agent-branch prefix. Default `agent/`. */
	readonly defaultAgentPrefix?: string;
	/** Default canonical worktrees dir (relative to workspaceRoot). */
	readonly canonicalWorktreesDirRel?: string;
}

export interface IStrandedBranch {
	readonly branch: string;
	readonly ahead: number;
	readonly behind: number;
	readonly lastCommitIso: string;
	readonly worktreePath: string | null;
}

export interface IDetectStrandedBranchesDeps {
	readonly listAgentBranches?: (
		cwd: string,
	) => Promise<readonly IStrandedBranch[]>;
	readonly now?: () => number;
	readonly thresholdBehind?: number;
}

const BRANCH_STATUS_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	reason: optionalString(),
	baseBranch: optionalString(),
	branches: optionalUnknown(),
	stranded: optionalUnknown(),
	worktrees: optionalUnknown(),
	mainCheckoutBranch: optionalString(),
	mainCheckoutDrift: optionalBoolean(),
	summary: optionalUnknown(),
	generatedAt: optionalString(),
});

const parseAheadBehindCounts = (
	raw: string,
): { ahead: number; behind: number } => {
	const parts = raw.trim().split(/\s+/u);
	const behind = Number.parseInt(parts[0] ?? '0', DECIMAL_RADIX);
	const ahead = Number.parseInt(parts[1] ?? '0', DECIMAL_RADIX);
	return {
		ahead: Number.isFinite(ahead) ? ahead : 0,
		behind: Number.isFinite(behind) ? behind : 0,
	};
};

const parseWorktreeBranchPaths = (raw: string): ReadonlyMap<string, string> => {
	const entries = new Map<string, string>();
	for (const block of raw
		.split('\n\n')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)) {
		let path = '';
		let branch = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('worktree ')) {
				path = line.slice('worktree '.length);
				continue;
			}
			if (line.startsWith('branch ')) {
				branch = line
					.slice('branch '.length)
					.replace(/^refs\/heads\//u, '');
			}
		}
		if (path.length > 0 && branch.length > 0) {
			entries.set(branch, path);
		}
	}
	return entries;
};

export const listAgentBranchesWithGit = async (
	run: IGitRunner,
	cwd: string,
	baseBranch = 'develop',
	agentPrefix = 'agent/',
): Promise<readonly IStrandedBranch[]> => {
	const branchListResult = await run([
		'-C',
		cwd,
		'branch',
		'--list',
		`${agentPrefix}*`,
	]);
	if (!branchListResult.ok) return [];

	const worktreeListResult = await run([
		'-C',
		cwd,
		'worktree',
		'list',
		'--porcelain',
	]);
	const worktreePaths = worktreeListResult.ok
		? parseWorktreeBranchPaths(worktreeListResult.output)
		: new Map<string, string>();
	const branchNames = parseBranchList(branchListResult.output).filter(
		(name) =>
			agentPrefix.length === 0 ? true : name.startsWith(agentPrefix),
	);
	const branches: IStrandedBranch[] = [];
	for (const branch of branchNames) {
		const [aheadBehindResult, lastCommitResult] = await Promise.all([
			run([
				'-C',
				cwd,
				'rev-list',
				'--left-right',
				'--count',
				`${baseBranch}...${branch}`,
			]),
			run(['-C', cwd, 'log', '-1', '--format=%cI', branch]),
		]);
		const { ahead, behind } = aheadBehindResult.ok
			? parseAheadBehindCounts(aheadBehindResult.output)
			: { ahead: 0, behind: 0 };
		branches.push({
			branch,
			ahead,
			behind,
			lastCommitIso: lastCommitResult.ok
				? lastCommitResult.output.trim()
				: '',
			worktreePath: worktreePaths.get(branch) ?? null,
		});
	}
	return branches;
};

export const detectStrandedBranches = async (
	deps: IDetectStrandedBranchesDeps,
): Promise<readonly IStrandedBranch[]> => {
	const listAgentBranches = deps.listAgentBranches;
	if (listAgentBranches === undefined) return [];
	const thresholdBehind =
		deps.thresholdBehind ?? DEFAULT_STRANDED_BEHIND_THRESHOLD;
	const branches = await listAgentBranches('.');
	return branches.filter(
		(branch) => branch.ahead === 0 && branch.behind >= thresholdBehind,
	);
};

/**
 * Read-only snapshot of every `agent/*` branch and every worktree in
 * the workspace. Lets any agent answer "what is everyone else doing
 * right now?" without grep. See `branch-status-engine.ts` for the
 * engine and `f00073` for the rationale.
 */
export const buildBranchStatusRegistration = (
	options: IBranchStatusToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_branch_status`;
	const run = options.run ?? createGitRunner(options.workspaceRoot);
	return {
		id: 'branch_status',
		summary:
			'Snapshot every agent/* branch and every worktree: ahead/behind vs base, dirty/untracked counts, out-of-cache flag.',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: BRANCH_STATUS_OUTPUT_SCHEMA,
					description:
						'Read-only snapshot of every `agent/*` branch and every worktree in the workspace. Reports ahead/behind counts vs baseBranch (default develop), last-commit age, merged flag, and per-worktree dirty + untracked file counts. Worktrees whose path lives outside <cacheDir>/mcp-vertex/.worktrees are flagged `outOfCache: true`. Use this before merging, before pushing, or whenever the orchestrator needs to know what other agents are doing.',
					inputSchema: z.object({
						baseBranch: z.string().optional(),
						agentPrefix: z.string().optional(),
					}),
				},
				async (args: {
					baseBranch?: string | undefined;
					agentPrefix?: string | undefined;
				}) => {
					const resolvedBaseBranch =
						args.baseBranch ??
						options.defaultBaseBranch ??
						'develop';
					const resolvedAgentPrefix =
						args.agentPrefix ??
						options.defaultAgentPrefix ??
						'agent/';
					const engineOptions = {
						run,
						workspaceRoot: options.workspaceRoot,
						baseBranch: resolvedBaseBranch,
						agentPrefix: resolvedAgentPrefix,
						...(options.canonicalWorktreesDirRel !== undefined
							? {
									canonicalWorktreesDir: `${options.workspaceRoot}/${options.canonicalWorktreesDirRel}`,
								}
							: {}),
					};
					const result = await runBranchStatusEngine(engineOptions);
					const response = result.ok
						? {
								...result,
								stranded: await detectStrandedBranches({
									listAgentBranches: async () =>
										listAgentBranchesWithGit(
											run,
											options.workspaceRoot,
											resolvedBaseBranch,
											resolvedAgentPrefix,
										),
								}),
							}
						: result;
					return toolJsonWithErrorFlag(response);
				},
			);
		},
	};
};
