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
	/** Workspace-relative directory holding all agent worktrees. */
	readonly worktreesDirRel?: string;
	/** Override the git runner (tests); defaults to the real `git` binary. */
	readonly run?: IGitRunner;
	/**
	 * f00052: host-scoped capability gate (`ctx.agentWorktreeEnabled`).
	 * When `false`/absent the tool stays registered but returns a
	 * structured `ok: false` error and never invokes the engine. Default
	 * off — a host opts in via `--agent-worktree=true` or
	 * `agentWorktree: true` in `mcp-vertex.config.json`.
	 */
	readonly enabled?: boolean | undefined;
}

/**
 * Exact, host-facing message returned when the capability is disabled.
 * Kept as a named constant so the tool, the unit spec and the e2e all
 * assert byte-identical text (f00052 S5/S7).
 */
export const AGENT_WORKTREE_DISABLED_REASON =
	'agent_worktree is disabled by host configuration. Pass --agent-worktree=true (CLI) or set agentWorktree: true in mcp-vertex.config.json to enable.';

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
						'Create, list or remove a per-agent git worktree (branch `agent/<name>`) so concurrent agents never share `.git/index`. In 2+ agent sessions this is the required git-isolation path before commit/push work. `create` is idempotent (returns the existing worktree if one is already there). `remove` refuses on uncommitted changes unless `force`. f00082 S4: when `host`+`model`+`task_id` are all set, the branch is `agent/<host>-<model>-<agent_name>-<task_id>` instead of the historical `agent/<agent_name>`. On a collision, a numeric suffix (`-1`, `-2`, …) is appended automatically.',
					inputSchema: z.object({
						action: z.enum(['create', 'list', 'remove']),
						agent: z.string().optional(),
						base_branch: z.string().optional(),
						force: z.boolean().optional(),
						// f00082 S4: composite identity. All optional; when
						// all three are set the engine composes a four-field
						// branch name. The numeric collision suffix is
						// applied automatically.
						host: z
							.enum([
								'vscode-copilot',
								'claude-code',
								'codex-cli',
								'cursor',
								'aider',
								'continue',
								'unknown',
							])
							.optional(),
						model: z.string().optional(),
						task_id: z.string().optional(),
					}),
				},
				async (args: {
					action: 'create' | 'list' | 'remove';
					agent?: string | undefined;
					base_branch?: string | undefined;
					force?: boolean | undefined;
					// f00082 S4: optional composite-identity fields. When
					// all three are set, the engine builds the branch
					// name as `agent/<host>-<model>-<agent_name>-<task_id>`.
					// When unset, the engine falls back to the historical
					// `agent/<agent_name>` layout. The numeric suffix
					// (`-1`, `-2`, …) is appended automatically when the
					// composite branch already exists.
					host?:
						| 'vscode-copilot'
						| 'claude-code'
						| 'codex-cli'
						| 'cursor'
						| 'aider'
						| 'continue'
						| 'unknown'
						| undefined;
					model?: string | undefined;
					task_id?: string | undefined;
				}) => {
					// f00052: host-scoped gate. Disabled (default) ⇒ return a
					// structured error that echoes the action and explains how
					// to enable; never invoke the engine, never throw.
					if (options.enabled !== true) {
						const disabled = {
							ok: false as const,
							action: args.action,
							reason: AGENT_WORKTREE_DISABLED_REASON,
						};
						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify(disabled),
								},
							],
							structuredContent: disabled as unknown as Record<
								string,
								unknown
							>,
							isError: true,
						};
					}
					const result = await runAgentWorktreeEngine(args, {
						run,
						workspaceRoot: options.workspaceRoot,
						...(options.worktreesDirRel !== undefined
							? { worktreesDirRel: options.worktreesDirRel }
							: {}),
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
