import z from 'zod';

import type {
	IResolvedHostIdentity,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import { dirname, basename } from 'node:path';

import {
	getAgentLockSessionBalance,
	releaseAgentSessionClaims,
	runAgentLockEngine,
} from '../locks/agent-lock-engine';
import type { ILockChangeListener } from '../locks/lock-change-listener';

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
	/**
	 * f00078 S4: when `true`, the engine refuses `action: 'claim'`
	 * unless the active branch is `agent/<name>`. This is the
	 * hard-runtime gate that prevents an agent from bypassing
	 * per-agent worktree isolation by going directly through
	 * `agent_lock` without first calling `agent_worktree create`.
	 * Defaults to `false` so solo hosts (the default) are
	 * unaffected.
	 */
	readonly agentWorktreeEnabled?: boolean;
	/**
	 * f00082 S3: boot-resolved host identity from `ctx.hostIdentity`. Used
	 * as the DEFAULT `host`/`model` in the echoed identity block when the
	 * caller omits them. Purely informational — never affects the lock op.
	 * Absent → only caller-supplied fields are echoed (pre-S3 behaviour).
	 */
	readonly defaultIdentity?: IResolvedHostIdentity;
}

/**
 * Derive the workspace root from `lockPathAbs`. Mirrors the engine's
 * own `resolveSessionWorkspaceRoot` so the tool layer doesn't need
 * ambient working-directory lookups when stamping the session balance.
 */
const deriveWorkspaceRoot = (lockPathAbs: string): string => {
	const parent = dirname(lockPathAbs);
	return basename(parent) === '.cache' ? dirname(parent) : parent;
};

type ICloseCapableServer = {
	readonly server?: {
		onclose?: (() => void) | undefined;
	};
};

const attachSessionCleanup = (server: unknown, lockPathAbs: string): void => {
	const transportServer = (server as ICloseCapableServer).server;
	if (transportServer === undefined) return;
	const previousOnClose = transportServer.onclose;
	transportServer.onclose = (): void => {
		void releaseAgentSessionClaims({ lockPath: lockPathAbs }).catch(
			() => undefined,
		);
		previousOnClose?.();
	};
};

const AGENT_LOCK_SESSION_SCHEMA = z.object({
	claims: z.number(),
	releases: z.number(),
	imbalance: z.number(),
});

const AGENT_LOCK_IDENTITY_SCHEMA = z.object({
	host: z.string().optional(),
	model: z.string().optional(),
	agent_name: z.string().optional(),
	task_id: z.string().optional(),
});

const AGENT_LOCK_ENTRY_SCHEMA = z.object({
	task_id: z.string(),
	agent: z.string(),
	ownership: z.array(z.string()),
	started_at: z.string(),
	last_seen: z.string(),
	parent_task_id: z.string().optional(),
	host: z.string().optional(),
	pid: z.number().optional(),
});

export const AGENT_LOCK_OUTPUT_SCHEMA = z.object({
	$schema: z.string().optional(),
	description: z.string().optional(),
	tool: z.string().optional(),
	action: z
		.enum(['claim', 'heartbeat', 'release', 'status', 'gc'])
		.optional(),
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
	heldFiles: z.array(z.string()).optional(),
	added_files: z.array(z.string()).optional(),
	not_granted: z
		.array(
			z.object({
				file: z.string(),
				conflicting_task: z.string(),
			}),
		)
		.optional(),
	// x00155 S2 / x00153 S5 — when `release` detects a caller-host
	// mismatch (recorded pid != live pid), the engine stamps
	// `cross_process_release: true` and echoes the original pid so
	// operators can tell host-restart cleanups from normal releases.
	cross_process_release: z.boolean().optional(),
	original_pid: z.number().optional(),
	blocked: z.boolean().optional(),
	blocked_reason: z.string().optional(),
	conflicting_task: z.string().optional(),
	conflicting_agent: z.string().optional(),
	overlapping_files: z.array(z.string()).optional(),
	claimed: z.boolean().optional(),
	released: z.boolean().optional(),
	removed: z.number().optional(),
	exists: z.boolean().optional(),
	active_write_lanes: z.number().optional(),
	dropped: z.number().optional(),
	version: z.number().optional(),
	stale_after_minutes: z.number().optional(),
	in_flight: z.array(AGENT_LOCK_ENTRY_SCHEMA).optional(),
	last_seen: z.string().optional(),
	reason: z.string().optional(),
	held_ms: z.number().optional(),
	// Every terminal lock outcome is a canonical success/error envelope.
	// Consumers must not infer success from action-specific fields such as
	// `claimed` or `removed`.
	ok: z.boolean(),
	session: AGENT_LOCK_SESSION_SCHEMA.optional(),
	// f00082 S3: the tool re-echoes the composite identity it was
	// called with, so a caller can attribute the lock op to a
	// (host, model, agent, task) without consulting the registry.
	identity: AGENT_LOCK_IDENTITY_SCHEMA.optional(),
});

export const AGENT_LOCK_INPUT_SCHEMA = z.object({
	action: z.enum(['claim', 'heartbeat', 'release', 'status', 'gc']),
	task_id: z.string().optional(),
	agent: z.string().optional(),
	files: z.array(z.string()).optional(),
	parent_task_id: z.string().optional(),
	onContention: z.enum(['steal', 'fail']).optional(),
	host: z.string().optional(),
	model: z.string().optional(),
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
			'Claim files before editing, heartbeat while working, release after (claim/heartbeat/release/status/gc). The write-ownership primitive.',
		tags: ['coordination'],
		register: async (server) => {
			attachSessionCleanup(server, options.lockPathAbs);
			server.registerTool(
				toolName,
				{
					outputSchema: AGENT_LOCK_OUTPUT_SCHEMA,
					description:
						'Write-ownership lock only: claim before editing, release after editing, status/gc for stale claims. Not a task planner.',
					inputSchema: AGENT_LOCK_INPUT_SCHEMA,
				},
				async (args) => {
					const res = await runAgentLockEngine(args, {
						lockPath: options.lockPathAbs,
						toolName,
						lockFileLabel: options.lockFileLabel,
						// f00078 S4: needs-worktree gate. When the host
						// has the gate on, claims are refused unless
						// the active branch is `agent/<name>`.
						agentWorktreeEnabled:
							options.agentWorktreeEnabled === true,
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
						args.action !== 'status' &&
						args.action !== 'heartbeat'
					) {
						options.lockChangeListener.onLockChanged({
							action: args.action,
							agent: args.agent,
							taskId: args.task_id,
						});
					}
					// f00082 S3: build the echoed identity block from the
					// fields the caller passed (omitting any absent).
					// Purely informational — never affects the lock op.
					const identity: Record<string, string> = {};
					if (typeof args.host === 'string')
						identity.host = args.host;
					else if (options.defaultIdentity?.host !== undefined)
						identity.host = options.defaultIdentity.host;
					if (typeof args.model === 'string')
						identity.model = args.model;
					else if (options.defaultIdentity?.model !== undefined)
						identity.model = options.defaultIdentity.model;
					if (typeof args.agent === 'string')
						identity.agent_name = args.agent;
					if (typeof args.task_id === 'string')
						identity.task_id = args.task_id;
					const hasIdentity = Object.keys(identity).length > 0;

					// a00069 S8: engine already stamps ok + session; tool layer
					// only merges identity and mirrors structuredContent.
					try {
						const parsed = JSON.parse(
							res.content[0]?.text ?? 'null',
						) as unknown;
						if (
							typeof parsed === 'object' &&
							parsed !== null &&
							!Array.isArray(parsed)
						) {
							const base = parsed as Record<string, unknown>;
							const blocked = base.blocked === true;
							const ok =
								typeof base.ok === 'boolean'
									? base.ok
									: res.isError !== true && !blocked;
							const balance = await getAgentLockSessionBalance(
								deriveWorkspaceRoot(options.lockPathAbs),
							);
							const session =
								typeof base.session === 'object' &&
								base.session !== null
									? base.session
									: {
											claims: balance.claims,
											releases: balance.releases,
											imbalance: balance.imbalance,
										};
							const merged: Record<string, unknown> = {
								...base,
								ok,
								session,
								...(hasIdentity ? { identity } : {}),
							};
							return {
								...res,
								// SDK skips outputSchema on isError; still attach content.
								...(res.isError
									? {}
									: { structuredContent: merged }),
								content: [
									{
										type: 'text' as const,
										text: JSON.stringify(merged),
									},
								],
							};
						}
					} catch {
						// fall through
					}
					return res;
				},
			);
		},
	};
};
