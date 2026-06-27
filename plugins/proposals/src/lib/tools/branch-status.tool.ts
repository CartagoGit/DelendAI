import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type { IGitRunner } from '../shared/git-runner';
import { runBranchStatusEngine } from '../shared/branch-status-engine';

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
	worktrees: z.array(WORKTREE_ENTRY).optional(),
	summary: SUMMARY.optional(),
	generatedAt: z.string().optional(),
});

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
					const engineOptions = {
						run:
							options.run ??
							createDefaultRunner(options.workspaceRoot),
						workspaceRoot: options.workspaceRoot,
						...(args.baseBranch !== undefined
							? { baseBranch: args.baseBranch }
							: options.defaultBaseBranch !== undefined
								? { baseBranch: options.defaultBaseBranch }
								: {}),
						...(args.agentPrefix !== undefined
							? { agentPrefix: args.agentPrefix }
							: options.defaultAgentPrefix !== undefined
								? { agentPrefix: options.defaultAgentPrefix }
								: {}),
						...(options.canonicalWorktreesDirRel !== undefined
							? {
									canonicalWorktreesDir: `${options.workspaceRoot}/${options.canonicalWorktreesDirRel}`,
								}
							: {}),
					};
					const result = await runBranchStatusEngine(engineOptions);
					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(result),
							},
						],
						structuredContent: result as unknown as Record<
							string,
							unknown
						>,
						...(result.ok ? {} : { isError: true }),
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
