import { execFile } from 'node:child_process';
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type { IGitRunner, IGitRunResult } from '../shared/git-runner';
import { runSwarmHygieneEngine } from '../shared/swarm-hygiene-engine';

export interface ISwarmHygieneToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly run?: IGitRunner;
	readonly defaultBaseBranch?: string;
	readonly defaultStaleMinutes?: number;
}

const RESCUE_CANDIDATE = z.object({
	branch: z.string(),
	ahead: z.number().int().nonnegative(),
	behind: z.number().int().nonnegative(),
	lastCommitMinutesAgo: z.number().int(),
	worktreePath: z.string(),
	diffStat: z.string(),
	cherryPickHint: z.string(),
});

const GC_ELIGIBLE = z.object({
	path: z.string(),
	branch: z.string(),
	reason: z.enum([
		'merged-and-clean',
		'merged-and-clean-with-force',
		'behind-only',
		'no-branch',
	]),
	dirtyFiles: z.number().int().nonnegative(),
	untrackedFiles: z.number().int().nonnegative(),
	outOfCache: z.boolean(),
	ageLabel: z.string(),
});

const OUT_OF_CACHE = z.object({
	path: z.string(),
	branch: z.string(),
	head: z.string(),
	lastCommitMinutesAgo: z.number().int(),
});

const SUMMARY = z.object({
	rescueCandidatesCount: z.number().int().nonnegative(),
	gcEligibleCount: z.number().int().nonnegative(),
	outOfCacheCount: z.number().int().nonnegative(),
});

const SWARM_HYGIENE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	reason: z.string().optional(),
	baseBranch: z.string().optional(),
	generatedAt: z.string().optional(),
	rescueCandidates: z.array(RESCUE_CANDIDATE).optional(),
	gcEligible: z.array(GC_ELIGIBLE).optional(),
	outOfCache: z.array(OUT_OF_CACHE).optional(),
	summary: SUMMARY.optional(),
});

/**
 * Read-only swarm hygiene snapshot. Composes three queries the
 * orchestrator needs in one structured payload:
 *
 *   1. rescueCandidates — branches with `ahead > 0 && !mergedIntoBase`
 *      whose commits are at risk of being lost. Each carries a
 *      cherry-pick hint and a diff stat.
 *   2. gcEligible — the dry-run plan from `branch_gc` (after the f00075
 *      S0 fix). Lets the orchestrator preview exactly what would be
 *      removed in `branch_gc({ dryRun: false })`.
 *   3. outOfCache — worktrees outside the canonical cache dir.
 *
 * Never mutates the workspace. Never executes cherry-pick. The
 * orchestrator or human reviews `diffStat` + `cherryPickHint` and
 * decides.
 */
export const buildSwarmHygieneRegistration = (
	options: ISwarmHygieneToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_swarm_hygiene`;
	return {
		id: 'swarm_hygiene',
		summary:
			'Read-only snapshot: rescue candidates (ahead + not merged), GC-eligible orphans, and out-of-cache worktrees.',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: SWARM_HYGIENE_OUTPUT_SCHEMA,
					description:
						"Read-only swarm hygiene snapshot. Returns three lists: rescueCandidates (agent/* branches with ahead>0 and not merged into develop — carries cherryPickHint + diffStat), gcEligible (the branch_gc dry-run plan), outOfCache (worktrees outside <cacheDir>/mcp-vertex/.worktrees). Use this before merging, before closing a session, or whenever the orchestrator wants to surface the swarm's rescue/cleanup opportunities without firing destructive tools.",
					inputSchema: z.object({
						baseBranch: z.string().optional(),
						staleMinutes: z.number().int().positive().optional(),
						force: z.boolean().optional(),
					}),
				},
				async (args: {
					baseBranch?: string | undefined;
					staleMinutes?: number | undefined;
					force?: boolean | undefined;
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
						...(args.staleMinutes !== undefined
							? { staleMinutes: args.staleMinutes }
							: options.defaultStaleMinutes !== undefined
								? { staleMinutes: options.defaultStaleMinutes }
								: {}),
						...(args.force !== undefined
							? { force: args.force }
							: {}),
					};
					const result = await runSwarmHygieneEngine(engineOptions);
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
