import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type { IGitRunner } from '../shared/git-runner';
import {
	parseBranchList,
	runBranchStatusEngine,
} from '../shared/branch-status-engine';

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

const BRANCH_ENTRY = z.object({
	name: z.string(),
	head: z.string(),
	ahead: z.number().int().nonnegative(),
	behind: z.number().int().nonnegative(),
	mergedIntoBase: z.boolean(),
	lastCommitMinutesAgo: z.number().int(),
	worktreePath: z.string(),
});

const WORKTREE_ENTRY = z.object({
	path: z.string(),
	head: z.string(),
	branch: z.string(),
	outOfCache: z.boolean(),
	dirtyFiles: z.number().int().nonnegative(),
	untrackedFiles: z.number().int().nonnegative(),
	ageLabel: z.string(),
});

const STRANDED_BRANCH_ENTRY = z.object({
	branch: z.string(),
	ahead: z.number().int().nonnegative(),
	behind: z.number().int().nonnegative(),
	lastCommitIso: z.string(),
	worktreePath: z.string().nullable(),
});

const SUMMARY = z.object({
	totalBranches: z.number().int().nonnegative(),
	totalWorktrees: z.number().int().nonnegative(),
	mergedCount: z.number().int().nonnegative(),
	aheadOfBaseCount: z.number().int().nonnegative(),
	behindBaseCount: z.number().int().nonnegative(),
	dirtyWorktrees: z.number().int().nonnegative(),
	untrackedWorktrees: z.number().int().nonnegative(),
	outOfCacheWorktrees: z.number().int().nonnegative(),
});

const BRANCH_STATUS_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	reason: z.string().optional(),
	baseBranch: z.string().optional(),
	branches: z.array(BRANCH_ENTRY).optional(),
	stranded: z.array(STRANDED_BRANCH_ENTRY).optional(),
	worktrees: z.array(WORKTREE_ENTRY).optional(),
	mainCheckoutBranch: z.string().optional(),
	mainCheckoutDrift: z.boolean().optional(),
	summary: SUMMARY.optional(),
	generatedAt: z.string().optional(),
});

const parseAheadBehindCounts = (
	raw: string,
): { ahead: number; behind: number } => {
	const parts = raw.trim().split(/\s+/u);
	const behind = Number.parseInt(parts[0] ?? '0', 10);
	const ahead = Number.parseInt(parts[1] ?? '0', 10);
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
	const thresholdBehind = deps.thresholdBehind ?? 10;
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
	const run = options.run ?? createDefaultRunner(options.workspaceRoot);
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
					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(response),
							},
						],
						structuredContent: response as unknown as Record<
							string,
							unknown
						>,
						...(response.ok ? {} : { isError: true }),
					};
				},
			);
		},
	};
};

import { execFile } from 'node:child_process';
import type { IGitRunResult } from '../shared/git-runner';

/**
 * Default runner used when the host does not inject one. Mirrors
 * `createGitRunner` in `shared/git-runner.ts` but stays local so this
 * file can be imported without pulling `node:child_process` into a
 * test that never invokes git.
 */
const createDefaultRunner =
	(cwd: string): IGitRunner =>
	(args) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					timeout: 15_000,
					maxBuffer: 8 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ ok: true, output: stdout });
						return;
					}
					resolve({
						ok: false,
						output: '',
						reason:
							(stderr || error.message || 'git command failed')
								.trim()
								.split('\n')[0] ?? 'git command failed',
					});
				},
			);
		});
