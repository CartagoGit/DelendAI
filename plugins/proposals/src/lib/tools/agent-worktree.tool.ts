import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { runAgentWorktreeEngine } from '../agents/agent-worktree-engine';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';

export interface IAgentWorktreeToolOptions {
	/** Tool namespace, e.g. `proposals` → `proposals_agent_worktree`. */
	readonly namespacePrefix: string;
	/** Absolute repo root. */
	readonly workspaceRoot: string;
	/** Override the git runner (tests); defaults to the real `git` binary. */
	readonly run?: IGitRunner;
}

const WORKTREE_ENTRY_OUTPUT_SCHEMA = z.object({
	path: z.string(),
	head: z.string(),
	branch: z.string().optional(),
	detached: z.boolean(),
	locked: z.boolean(),
});

const AGENT_WORKTREE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	action: z.enum(['create', 'list', 'remove']),
	reason: z.string().optional(),
	path: z.string().optional(),
	branch: z.string().optional(),
	created: z.boolean().optional(),
	removed: z.boolean().optional(),
	worktrees: z.array(WORKTREE_ENTRY_OUTPUT_SCHEMA).optional(),
});

/**
 * One git worktree (+ branch `agent/<name>`) per concurrent agent, so two
 * agents working the same repo never share `.git/index` — the failure
 * mode otherwise is one agent's `git add`/`commit` racing another's and
 * silently folding unrelated, unreviewed changes into the wrong commit.
 */
export const buildAgentWorktreeRegistration = (
	options: IAgentWorktreeToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_agent_worktree`;
	const run = options.run ?? createGitRunner(options.workspaceRoot);
	return {
		id: 'agent_worktree',
		effects: ['write', 'spawn'],
		summary:
			'Isolate a concurrent agent into its own git worktree + branch (create/list/remove). Required when 2+ agents share this repo.',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: AGENT_WORKTREE_OUTPUT_SCHEMA,
					description:
						'Create, list or remove a per-agent git worktree (branch `agent/<name>`) so concurrent agents never share `.git/index`. In 2+ agent sessions this is the required git-isolation path before commit/push work. `create` is idempotent (returns the existing worktree if one is already there). `remove` refuses on uncommitted changes unless `force`.',
					inputSchema: z.object({
						action: z.enum(['create', 'list', 'remove']),
						agent: z.string().optional(),
						base_branch: z.string().optional(),
						force: z.boolean().optional(),
					}),
				},
				async (args: {
					action: 'create' | 'list' | 'remove';
					agent?: string | undefined;
					base_branch?: string | undefined;
					force?: boolean | undefined;
				}) => {
					const result = await runAgentWorktreeEngine(args, {
						run,
						workspaceRoot: options.workspaceRoot,
					});
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
