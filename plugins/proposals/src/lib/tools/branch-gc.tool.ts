import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';

import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { runBranchGcEngine } from '../shared/branch-gc-engine';
import {
	resolveBaseBranchAndStaleMinutes,
	toolJsonWithErrorFlag,
} from '../shared/branch-tool-helpers';

export interface IBranchGcToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** Override the git runner (tests). */
	readonly run?: IGitRunner;
	readonly defaultBaseBranch?: string;
	readonly defaultStaleMinutes?: number;
	readonly defaultProtectedBranches?: readonly string[];
}

const REMOVED_ENTRY = z.object({
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

const SKIPPED_ENTRY = z.object({
	path: z.string(),
	branch: z.string(),
	reason: z.enum([
		'dirty',
		'untracked',
		'unmerged',
		'fresh',
		'protected-branch',
		'not-found',
		'no-branch',
	]),
	detail: z.string(),
});

const SUMMARY = z.object({
	removedCount: z.number().int().nonnegative(),
	skippedCount: z.number().int().nonnegative(),
	dryRunRemovedCount: z.number().int().nonnegative(),
});

const BRANCH_GC_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	reason: z.string().optional(),
	baseBranch: z.string().optional(),
	dryRun: z.boolean().optional(),
	staleMinutes: z.number().int().optional(),
	removed: z.array(REMOVED_ENTRY).optional(),
	skipped: z.array(SKIPPED_ENTRY).optional(),
	summary: SUMMARY.optional(),
});

/**
 * Idempotent cleanup of worktrees that have decayed into orphan state
 * (merged into base, clean, idle > staleMinutes). Defaults to
 * `dryRun: true` so the orchestrator always sees the plan before any
 * filesystem mutation. Unmerged branches are never removed.
 */
export const buildBranchGcRegistration = (
	options: IBranchGcToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_branch_gc`;
	return {
		id: 'branch_gc',
		effects: ['write'],
		summary:
			'Remove worktrees whose branch is merged into base, clean, and idle (dry-run default; unmerged branches are sacred).',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: BRANCH_GC_OUTPUT_SCHEMA,
					description:
						'Idempotent cleanup of worktrees that have decayed into orphan state. A worktree is eligible when its branch is merged into baseBranch (default develop), its working tree is clean, and the last commit is older than staleMinutes (default 60). Defaults to dryRun: true; pass dryRun: false to actually execute. force: true allows removal of dirty worktrees (unmerged branches are still refused — that is sacred). Never pushes.',
					inputSchema: z.object({
						baseBranch: z.string().optional(),
						staleMinutes: z.number().int().positive().optional(),
						dryRun: z.boolean().optional(),
						force: z.boolean().optional(),
					}),
				},
				async (args: {
					baseBranch?: string | undefined;
					staleMinutes?: number | undefined;
					dryRun?: boolean | undefined;
					force?: boolean | undefined;
				}) => {
					const engineOptions = {
						run:
							options.run ??
							createGitRunner(options.workspaceRoot),
						workspaceRoot: options.workspaceRoot,
						...resolveBaseBranchAndStaleMinutes(args, {
							baseBranch: options.defaultBaseBranch,
							staleMinutes: options.defaultStaleMinutes,
						}),
						...(args.dryRun !== undefined
							? { dryRun: args.dryRun }
							: {}),
						...(args.force !== undefined
							? { force: args.force }
							: {}),
						...(options.defaultProtectedBranches !== undefined
							? {
									protectedBranches:
										options.defaultProtectedBranches,
								}
							: {}),
					};
					const result = await runBranchGcEngine(engineOptions);
					return toolJsonWithErrorFlag(result);
				},
			);
		},
	};
};
