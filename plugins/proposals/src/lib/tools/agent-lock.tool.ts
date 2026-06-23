import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';
import type { ILockChangeListener } from '../locks/lock-change-listener';
import { lockChangeMultiplexer } from '../locks/lock-change-listener';

export interface IAgentLockToolOptions {
	/** Tool namespace, e.g. `proposals` → `proposals_agent_lock`. */
	readonly namespacePrefix: string;
	/** Absolute path to the lock file (resolved from the workspace). */
	readonly lockPathAbs: string;
	/** Workspace-relative label echoed in payloads. */
	readonly lockFileLabel: string;
	/**
	 * Solid-ISP: optional listener fired after every successful
	 * `claim`/`release`/`gc` (status is excluded — it never mutates
	 * the file). Replaces the previous `onLockChanged?: () => void`
	 * callback so the tool can carry richer event payloads without
	 * breaking listeners. The plugin may pass a multiplexer wrapping
	 * any number of concrete listeners (loop detector, drift counter,
	 * audit hook, etc.).
	 */
	readonly lockChangeListener?: ILockChangeListener;
}

const AGENT_LOCK_ENTRY_OUTPUT_SCHEMA = z.object({
	task_id: z.string(),
	agent: z.string(),
	ownership: z.array(z.string()),
	started_at: z.string(),
	last_seen: z.string(),
	parent_task_id: z.string().optional(),
});

const AGENT_LOCK_OUTPUT_SCHEMA = z.object({
	tool: z.string().optional(),
	action: z.enum(['claim', 'release', 'status', 'gc']).optional(),
	path: z.string().optional(),
	lock_path: z.string().optional(),
	task_id: z.string().optional(),
	agent: z.string().optional(),
	error: z
		.union([
			z.string(),
			z.object({
				reason: z.string(),
				nextAction: z.string().optional(),
			}),
		])
		.optional(),
	blockerType: z.string().optional(),
	nextAction: z.string().optional(),
	summary: z.string().optional(),
	refreshed: z.boolean().optional(),
	ownership_count: z.number().optional(),
	blocked: z.boolean().optional(),
	blocked_reason: z.string().optional(),
	conflicting_task: z.string().optional(),
	conflicting_agent: z.string().optional(),
	overlapping_files: z.array(z.string()).optional(),
	claimed: z.boolean().optional(),
	removed: z.number().optional(),
	exists: z.boolean().optional(),
	active_write_lanes: z.number().optional(),
	dropped: z.number().optional(),
	version: z.number().optional(),
	stale_after_minutes: z.number().optional(),
	in_flight: z.array(AGENT_LOCK_ENTRY_OUTPUT_SCHEMA).optional(),
	ok: z.boolean().optional(),
});

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
					outputSchema: AGENT_LOCK_OUTPUT_SCHEMA,
					description:
						'Write-ownership lock only: claim before editing, release after editing, status/gc for stale claims. Not a task planner.',
					inputSchema: z.object({
						action: z.enum(['claim', 'release', 'status', 'gc']),
						task_id: z.string().optional(),
						agent: z.string().optional(),
						files: z.array(z.string()).optional(),
						parent_task_id: z.string().optional(),
						/**
						 * What to do when claim/release/gc contends with a *live*
						 * holder past the mutex's contention timeout:
						 * `'steal'` (default) reclaims as before; `'fail'` rejects
						 * instead of clobbering a slow-but-alive holder.
						 */
						onContention: z.enum(['steal', 'fail']).optional(),
					}),
				},
				async (args) => {
					const res = await runAgentLockEngine(args, {
						lockPath: options.lockPathAbs,
						toolName,
						lockFileLabel: options.lockFileLabel,
					});
					// Solid-ISP: fire the change listener ONLY for actions
					// that actually mutate the file. `status` is excluded —
					// it never changes the file, so listeners would do
					// useless work. Each listener handles its own exceptions
					// (or relies on the multiplexer's outer try-catch); the
					// tool itself never lets a listener fail it.
					if (
						!res.isError &&
						options.lockChangeListener !== undefined &&
						args.action !== 'status'
					) {
						options.lockChangeListener.onLockChanged({
							action: args.action,
							agent: args.agent,
							taskId: args.task_id,
						});
					}
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
