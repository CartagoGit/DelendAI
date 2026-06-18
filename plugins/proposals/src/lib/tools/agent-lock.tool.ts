import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';

export interface IAgentLockToolOptions {
	/** Tool namespace, e.g. `proposals` → `proposals_agent_lock`. */
	readonly namespacePrefix: string;
	/** Absolute path to the lock file (resolved from the workspace). */
	readonly lockPathAbs: string;
	/** Workspace-relative label echoed in payloads. */
	readonly lockFileLabel: string;
}

/**
 * Write-ownership lock: claim before editing, release after, status/gc
 * for stale claims. Thin adapter over the (tested) agent-lock engine;
 * the plugin injects the resolved path so the engine stays agnostic.
 */
export const buildAgentLockRegistration = (
	options: IAgentLockToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix}_agent_lock`;
	return {
		id: 'agent_lock',
		effects: ['write'],
		summary:
			'Claim files before editing, release after (claim/release/status/gc). The write-ownership primitive.',
		tags: ['coordination'],
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					outputSchema: z.object({}).catchall(z.unknown()),
					description:
						'Write-ownership lock only: claim before editing, release after editing, status/gc for stale claims. Not a task planner.',
					inputSchema: z.object({
						action: z.enum(['claim', 'release', 'status', 'gc']),
						task_id: z.string().optional(),
						agent: z.string().optional(),
						files: z.array(z.string()).optional(),
						parent_task_id: z.string().optional(),
					}),
				},
				async (args) => {
					const res = await runAgentLockEngine(args, {
						lockPath: options.lockPathAbs,
						toolName,
						lockFileLabel: options.lockFileLabel,
					});
					// The engine returns text-only; mirror its JSON payload into
					// structuredContent so the declared outputSchema is satisfied
					// (the SDK validates it on success).
					if (!res.isError) {
						try {
							const parsed = JSON.parse(
								res.content[0]?.text ?? 'null',
							) as unknown;
							if (
								typeof parsed === 'object' &&
								parsed !== null &&
								!Array.isArray(parsed)
							) {
								return {
									...res,
									structuredContent: parsed as Record<
										string,
										unknown
									>,
								};
							}
						} catch {
							// fall through: return as-is
						}
					}
					return res;
				},
			);
		},
	};
};
