import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import { CorruptFileError, toolJson } from '@mcp-vertex/core/public';

import {
	enqueue,
	parseQueue,
	persistQueue,
} from '../agents/persistent-task-queue';
import { gcZombies } from '../agents/zombie-reconcile';
import {
	AGENT_CANONICAL_ROLES,
	AGENT_CONVENTIONS,
} from '../shared/agent-conventions';
import type { IAgentCanonicalRole } from '../shared/agent-conventions';
import { createAgentRegistryStore } from '../shared/agent-registry-store';
import type { IAgentAssignment } from '../shared/agent-registry-store';
import { buildAgentTree } from '../shared/agent-tree';
import {
	DEFAULT_AGENT_NAME_POOL,
	pickFromPool,
} from '../knowledge/agent-name-pool';

export interface IAgentNamesToolOptions {
	readonly namespacePrefix: string;
	/** Resolved absolute paths the registry and its sidecars live at. */
	readonly registryPathAbs: string;
	readonly lockPathAbs: string;
	readonly queuePathAbs: string;
	readonly closedTasksPathAbs: string;
	/** Absolute workspace root — anchors `waitFor.file` resolution. */
	readonly workspaceRoot: string;
	/** Symbolic name pool (defaults to the constellation pool). */
	readonly pool?: readonly string[];
}

export interface IAgentNamesArgs {
	readonly action:
		| 'assign'
		| 'release'
		| 'heartbeat'
		| 'list'
		| 'tree'
		| 'who_uses'
		| 'gc'
		| 'reconcile';
	readonly task_id?: string | undefined;
	readonly agent?: string | undefined;
	readonly agent_slot?: string | undefined;
	readonly parent_task_id?: string | null | undefined;
	readonly topic?: string | undefined;
	readonly now?: string | undefined;
	readonly dry_run?: boolean | undefined;
	readonly stale_after_minutes?: number | undefined;
	/** f00082 S3: composite-identity fields, persisted on assign. */
	readonly host?: string | undefined;
	readonly model?: string | undefined;
}

// Delegates to the shared `toolJson` (M45: a hand-rolled duplicate of this
// helper across proposals tools is what omitted `structuredContent` and
// crashed `auto_work`/`continue_proposal` on their outputSchema-declared
// responses). Every call site here passes a plain object, so toolJson's
// structuredContent derivation always applies.
const json = (value: unknown, isError = false): IToolTextResult =>
	isError ? { ...toolJson(value), isError: true } : toolJson(value);

const AGENT_ASSIGNMENT_SCHEMA = z.object({
	task_id: z.string(),
	agent_name: z.string(),
	agent_slot: z.string(),
	parent_task_id: z.string().nullable(),
	depth: z.number(),
	topic: z.string(),
	adopted: z.boolean(),
	assigned_at: z.string(),
	last_seen: z.string(),
	cooldown_until: z.string().nullable(),
	status: z.enum(['active', 'cooldown', 'orphan']),
	host: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	children: z.array(z.unknown()).optional(),
});

/** f00082 S3: the closed set of known hosts (mirrors core AgentHost). */
const KNOWN_HOSTS = [
	'vscode-copilot',
	'claude-code',
	'codex-cli',
	'cursor',
	'aider',
	'continue',
	'unknown',
] as const;

/**
 * Coerce a caller-supplied host string into the closed `AgentHost`
 * union, falling back to `'unknown'` (lossy-friendly, matching the
 * parser in `agent-identity.ts`). Returns `null` when the caller
 * passed nothing, so the registry stores an explicit `null`.
 */
const coerceHost = (
	host: string | undefined,
): NonNullable<IAgentAssignment['host']> | null => {
	if (host === undefined) return null;
	return (KNOWN_HOSTS as readonly string[]).includes(host)
		? (host as NonNullable<IAgentAssignment['host']>)
		: 'unknown';
};

const AGENT_ADOPTION_SCHEMA = z.object({
	name: z.string(),
	task_id: z.string(),
});

const ZOMBIE_ORPHAN_SCHEMA = z.object({
	agentName: z.string(),
	taskId: z.string(),
	agentSlot: z.string(),
	lastSeen: z.string(),
	ageMinutes: z.number(),
	reason: z.enum([
		'cooldown_null',
		'stale_no_lock',
		'stale_with_orphaned_lock',
	]),
	recommendedAction: z.enum(['force_release', 'extend_cooldown', 'escalate']),
});

const AGENT_NAMES_OUTPUT_SCHEMA = z.object({
	error: z.string().optional(),
	backup: z.string().nullable().optional(),
	nextAction: z.string().optional(),
	summary: z
		.object({
			active: z.number(),
			cooldown: z.number(),
			orphan: z.number(),
			adopted: z.number(),
		})
		.optional(),
	assignments: z.array(AGENT_ASSIGNMENT_SCHEMA).optional(),
	adopted: z.array(AGENT_ADOPTION_SCHEMA).optional(),
	tree: z.array(AGENT_ASSIGNMENT_SCHEMA).optional(),
	agent: z.string().optional(),
	status: z.string().optional(),
	in_cooldown: z.boolean().optional(),
	task_id: z.string().optional(),
	released: z.array(z.string()).optional(),
	promoted: z.number().optional(),
	freed: z.number().optional(),
	blocked: z.boolean().optional(),
	blockerType: z.string().optional(),
	reason: z.string().optional(),
	depth: z.number().optional(),
	max_depth: z.number().optional(),
	allowed: z.array(z.string()).optional(),
	pool_size: z.number().optional(),
	agent_name: z.string().optional(),
	agent_slot: z.string().optional(),
	parent_task_id: z.string().nullable().optional(),
	topic: z.string().optional(),
	assigned_at: z.string().optional(),
	last_seen: z.string().optional(),
	cooldown_until: z.string().nullable().optional(),
	host: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	scannedAt: z.string().optional(),
	staleAfterMinutes: z.number().optional(),
	orphans: z.array(ZOMBIE_ORPHAN_SCHEMA).optional(),
	threshold: z.enum(['green', 'yellow', 'red']).optional(),
	recommendation: z.string().optional(),
});

const isCanonicalRole = (value: string): value is IAgentCanonicalRole =>
	(AGENT_CANONICAL_ROLES as readonly string[]).includes(value);

const activeNames = (assignments: readonly IAgentAssignment[]): Set<string> =>
	new Set(
		assignments
			.filter((a) => a.status === 'active')
			.map((a) => a.agent_name),
	);

const cooldownNames = (
	assignments: readonly IAgentAssignment[],
	atIso: string,
): Set<string> =>
	new Set(
		assignments
			.filter(
				(a) =>
					a.status === 'cooldown' &&
					a.cooldown_until !== null &&
					a.cooldown_until > atIso,
			)
			.map((a) => a.agent_name),
	);

/**
 * Agent name registry for the WHOLE agent tree — the root orchestrator
 * (slot `orchestrator`, depth 0, no parent) included, not only
 * subagents. Actions: assign / release / heartbeat / list / tree /
 * who_uses / gc / reconcile. Thin orchestration over the (tested)
 * registry-store, tree, zombie-gc and queue engines.
 */
export const runAgentNames = async (
	args: IAgentNamesArgs,
	options: IAgentNamesToolOptions,
): Promise<IToolTextResult> => {
	try {
		return await runAgentNamesImpl(args, options);
	} catch (err) {
		if (err instanceof CorruptFileError) {
			// corrupt ≠ empty: surface it instead of acting on a blank
			// registry, which would let the orchestrator re-issue names
			// already held by live agents.
			return json(
				{
					error: `agent registry is corrupt: ${err.message}`,
					backup: err.backupPath,
					nextAction: err.backupPath
						? `Corrupt registry preserved at "${err.backupPath}". Inspect or delete it, then retry.`
						: 'Could not back up the corrupt registry; inspect it manually before retrying.',
				},
				true,
			);
		}
		throw err;
	}
};

const runAgentNamesImpl = async (
	args: IAgentNamesArgs,
	options: IAgentNamesToolOptions,
): Promise<IToolTextResult> => {
	const store = createAgentRegistryStore(options.registryPathAbs);
	const pool = options.pool ?? DEFAULT_AGENT_NAME_POOL;
	const poolNames = new Set(pool);
	const at = args.now ?? new Date().toISOString();

	const emitQueueEvent = async (taskId: string, priority: number) => {
		try {
			const queue = await parseQueue(
				options.queuePathAbs,
				options.closedTasksPathAbs,
				options.workspaceRoot,
			);
			const updated = enqueue(queue, {
				taskId,
				enqueuedAt: at,
				priority: priority as 1 | 2 | 3 | 4 | 5,
				waitFor: [],
				owner: {
					taskId,
					agentName: 'watchdog',
					agentSlot: 'orchestrator',
				},
				observe: [],
				status: 'queued',
			});
			await persistQueue(updated, options.queuePathAbs);
		} catch {
			// Queue is optional coordination; never fail the registry op.
		}
	};

	switch (args.action) {
		case 'list': {
			const r = await store.read();
			return json({
				summary: {
					active: r.assignments.filter((a) => a.status === 'active')
						.length,
					cooldown: r.assignments.filter(
						(a) => a.status === 'cooldown',
					).length,
					orphan: r.assignments.filter((a) => a.status === 'orphan')
						.length,
					adopted: r.adopted.length,
				},
				assignments: r.assignments,
				adopted: r.adopted,
			});
		}

		case 'tree': {
			const r = await store.read();
			return json({ tree: buildAgentTree(r) });
		}

		case 'who_uses': {
			if (!args.agent) return json({ error: 'agent required' }, true);
			const r = await store.read();
			if (poolNames.has(args.agent)) {
				const active = r.assignments.find(
					(a) => a.agent_name === args.agent && a.status === 'active',
				);
				if (active)
					return json({
						agent: args.agent,
						status: 'active',
						in_cooldown: false,
						task_id: active.task_id,
					});
				const held = r.assignments.find(
					(a) =>
						a.agent_name === args.agent &&
						a.status === 'cooldown' &&
						a.cooldown_until !== null &&
						a.cooldown_until > at,
				);
				if (held)
					return json({
						agent: args.agent,
						status: 'cooldown',
						in_cooldown: true,
						task_id: held.task_id,
					});
				return json({
					agent: args.agent,
					status: 'free',
					in_cooldown: false,
				});
			}
			const adopted = r.adopted.find((a) => a.name === args.agent);
			return json({
				agent: args.agent,
				status: adopted ? 'adopted' : 'free',
				in_cooldown: false,
			});
		}

		case 'heartbeat': {
			if (!args.task_id) return json({ error: 'task_id required' }, true);
			const r = await store.read();
			const entry = r.assignments.find((a) => a.task_id === args.task_id);
			if (!entry) return json({ error: 'unknown task_id' }, true);
			entry.last_seen = at;
			await store.write(r);
			return json(entry);
		}

		case 'release': {
			if (!args.task_id) return json({ error: 'task_id required' }, true);
			const cooldownUntil = new Date(
				new Date(at).getTime() +
					AGENT_CONVENTIONS.cooldown_days * 86_400_000,
			).toISOString();
			await store.release(args.task_id, cooldownUntil);
			const r = await store.read();
			const released = new Set<string>([args.task_id]);
			let changed = true;
			while (changed) {
				changed = false;
				for (const a of r.assignments) {
					if (
						a.parent_task_id &&
						released.has(a.parent_task_id) &&
						!released.has(a.task_id)
					) {
						a.status = 'cooldown';
						a.cooldown_until = cooldownUntil;
						a.last_seen = at;
						released.add(a.task_id);
						changed = true;
					}
				}
			}
			await store.write(r);
			return json({ released: [...released] });
		}

		case 'gc': {
			const r = await store.read();
			const cutoff =
				new Date(at).getTime() -
				AGENT_CONVENTIONS.heartbeat_ttl_minutes * 60_000;
			let freed = 0;
			for (const a of r.assignments) {
				if (a.status !== 'active') continue;
				if (new Date(a.last_seen).getTime() < cutoff) {
					a.status = 'orphan';
					a.cooldown_until = new Date(
						new Date(at).getTime() +
							AGENT_CONVENTIONS.cooldown_days * 86_400_000,
					).toISOString();
					freed += 1;
				}
			}
			await store.write(r);
			try {
				await gcZombies(
					options.registryPathAbs,
					options.lockPathAbs,
					options.queuePathAbs,
					{
						dryRun: false,
						staleAfterMinutes:
							AGENT_CONVENTIONS.heartbeat_ttl_minutes,
						now: new Date(at),
						queueEmitter: emitQueueEvent,
					},
				);
			} catch {
				// graceful degradation
			}
			return json({ promoted: freed, freed });
		}

		case 'reconcile': {
			const report = await gcZombies(
				options.registryPathAbs,
				options.lockPathAbs,
				options.queuePathAbs,
				{
					dryRun: args.dry_run,
					staleAfterMinutes: args.stale_after_minutes,
					now: new Date(at),
					queueEmitter: emitQueueEvent,
				},
			);
			return json(report);
		}

		case 'assign': {
			if (!args.task_id || !args.agent_slot)
				return json({ error: 'task_id and agent_slot required' }, true);
			if (!isCanonicalRole(args.agent_slot))
				return json(
					{
						error: 'agent_slot must be a canonical role',
						allowed: AGENT_CANONICAL_ROLES,
					},
					true,
				);
			const r = await store.read();
			const parent = args.parent_task_id
				? (r.assignments.find(
						(a) => a.task_id === args.parent_task_id,
					) ?? null)
				: null;
			const depth = parent ? parent.depth + 1 : 0;
			if (depth >= AGENT_CONVENTIONS.max_depth)
				return json(
					{
						blocked: true,
						blockerType: 'name-conflict',
						reason: 'max_depth_exceeded',
						depth,
						max_depth: AGENT_CONVENTIONS.max_depth,
						nextAction:
							'Continue as a root-level handoff or ask the orchestrator to reattach the child; do not retry the same parent/depth.',
					},
					true,
				);

			const taken = activeNames(r.assignments);
			const inCooldown = cooldownNames(r.assignments, at);
			let agentName: string;
			let adopted = false;

			if (args.agent) {
				if (poolNames.has(args.agent)) {
					if (taken.has(args.agent) || inCooldown.has(args.agent))
						return json(
							{
								blocked: true,
								blockerType: 'name-conflict',
								reason: 'cooldown_or_taken',
								agent: args.agent,
								nextAction:
									'Assign without `agent` or choose another free pool name; do not retry the same requested name.',
							},
							true,
						);
					agentName = args.agent;
				} else {
					const updated = await store.markAdopted({
						name: args.agent,
						task_id: args.task_id,
					});
					r.adopted = updated.adopted;
					agentName = args.agent;
					adopted = true;
				}
			} else {
				const picked = pickFromPool(
					pool,
					new Set([...taken, ...inCooldown]),
					args.task_id,
				);
				if (!picked)
					return json(
						{ error: 'pool_exhausted', pool_size: pool.length },
						true,
					);
				agentName = picked;
			}

			const assignment: IAgentAssignment = {
				task_id: args.task_id,
				agent_name: agentName,
				agent_slot: args.agent_slot,
				parent_task_id: args.parent_task_id ?? null,
				depth,
				topic: args.topic ?? '',
				adopted,
				assigned_at: at,
				last_seen: at,
				cooldown_until: null,
				status: 'active',
				host: coerceHost(args.host),
				model: args.model ?? null,
			};
			await store.upsert(assignment);
			return json(assignment);
		}

		default:
			return json({ error: 'unknown action' }, true);
	}
};

/** Registration for `<prefix>_agent_names`. */
export const buildAgentNamesRegistration = (
	options: IAgentNamesToolOptions,
): IToolRegistration => ({
	id: 'agent_names',
	effects: ['write'],
	summary:
		'Name the whole agent tree (orchestrator included): assign/release/heartbeat/list/tree/who_uses/gc/reconcile.',
	tags: ['coordination'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_agent_names`,
			{
				outputSchema: AGENT_NAMES_OUTPUT_SCHEMA,
				description:
					'Agent name registry for the whole agent tree — the root orchestrator (slot "orchestrator", depth 0) included, not only subagents. Actions: assign/release/heartbeat/list/tree/who_uses/gc/reconcile. Use for named/delegated agents, not normal single-slice work.',
				inputSchema: z.object({
					action: z.enum([
						'assign',
						'release',
						'heartbeat',
						'list',
						'tree',
						'who_uses',
						'gc',
						'reconcile',
					]),
					task_id: z.string().optional(),
					agent: z.string().optional(),
					agent_slot: z.string().optional(),
					parent_task_id: z.string().nullable().optional(),
					topic: z.string().optional(),
					now: z.string().optional(),
					dry_run: z.boolean().optional(),
					stale_after_minutes: z.number().optional(),
					host: z
						.string()
						.optional()
						.describe(
							'f00082: host/IDE driving the agent (e.g. "vscode-copilot"). Unknown values are stored as "unknown".',
						),
					model: z
						.string()
						.optional()
						.describe(
							'f00082: LLM model name (free-form, e.g. "m3"). Recorded for forensics; not authenticated.',
						),
				}),
			},
			async (args: IAgentNamesArgs) => runAgentNames(args, options),
		);
	},
});
