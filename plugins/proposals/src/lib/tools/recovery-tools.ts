import { mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { z } from 'zod';

import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
	type IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { createAgentRegistryStore } from '../shared/agent-registry-store';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';

export interface IRecoveryEvent {
	readonly kind: 'agent-alive' | 'agent-idle' | 'agent-dead';
	readonly agent: string;
	readonly taskId: string;
	readonly ts: string;
	readonly lastSeen: string;
	readonly missedBeats: number;
}

export interface IRecoveryEventBuffer {
	add(event: IRecoveryEvent): void;
	list(now?: Date): IRecoveryEvent[];
	findDead(agent: string, taskId?: string): IRecoveryEvent | undefined;
}

export const createRecoveryEventBuffer = (
	ttlMs = 60 * 60 * 1000,
): IRecoveryEventBuffer => {
	const events: IRecoveryEvent[] = [];
	const gc = (now: Date): void => {
		const cutoff = now.getTime() - ttlMs;
		const keep = events.filter((event) => {
			const t = new Date(event.ts).getTime();
			return !Number.isNaN(t) && t >= cutoff;
		});
		events.splice(0, events.length, ...keep);
	};
	return {
		add(event) {
			events.push(event);
			gc(new Date(event.ts));
		},
		list(now = new Date()) {
			gc(now);
			return [...events];
		},
		findDead(agent, taskId) {
			return [...events]
				.reverse()
				.find(
					(event) =>
						event.kind === 'agent-dead' &&
						event.agent === agent &&
						(taskId === undefined || event.taskId === taskId),
				);
		},
	};
};

export interface IRecoveryToolOptions {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly lockPathAbs: string;
	readonly agentRegistryPathAbs: string;
	readonly workspaceRoot: string;
	readonly eventBuffer?: IRecoveryEventBuffer;
	readonly gitRunner?: IGitRunner;
}

interface ILocatedProposal {
	readonly absPath: string;
	readonly relPath: string;
	readonly folder: string;
	readonly raw: string;
	readonly frontmatter: Record<string, unknown>;
	readonly status: string;
}

const isKnownStatus = (value: string): value is IProposalStatus =>
	value in PROPOSAL_STATUSES;

const TOOL_ERROR_SCHEMA = z.object({
	reason: z.string(),
	nextAction: z.string().optional(),
});

const RECOVERY_EVENT_SCHEMA = z.object({
	kind: z.enum(['agent-alive', 'agent-idle', 'agent-dead']),
	agent: z.string(),
	taskId: z.string(),
	ts: z.string(),
	lastSeen: z.string(),
	missedBeats: z.number(),
});

const STALE_PROPOSAL_SCHEMA = RECOVERY_EVENT_SCHEMA.extend({
	suggestedActions: z.array(z.string()),
});

const RECOVERY_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: TOOL_ERROR_SCHEMA.optional(),
	count: z.number().optional(),
	zombies: z.array(STALE_PROPOSAL_SCHEMA).optional(),
	taskId: z.string().optional(),
	agent: z.string().optional(),
	released: z.boolean().optional(),
	id: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	reason: z.string().optional(),
	lockReleased: z.boolean().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
	changed: z.boolean().optional(),
	path: z.string().optional(),
	dryRun: z.boolean().optional(),
	file: z.string().optional(),
	folder: z.string().optional(),
	status: z.string().optional(),
	lockOwners: z.array(z.string()).optional(),
	lastHeartbeat: z.string().optional(),
	lastAgentDeadEvent: RECOVERY_EVENT_SCHEMA.optional(),
	inconsistencies: z.array(z.string()).optional(),
	suggestedActions: z.array(z.string()).optional(),
});

const locateProposal = async (
	proposalsDirAbs: string,
	id: string,
): Promise<ILocatedProposal | null> => {
	for (const folder of [...Object.values(STATUS_TO_FOLDER), '.']) {
		const dirAbs = join(proposalsDirAbs, folder);
		const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
			const absPath = join(dirAbs, entry.name);
			const raw = await readFile(absPath, 'utf8');
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			if (fm.id !== id) continue;
			return {
				absPath,
				relPath: relative(proposalsDirAbs, absPath),
				folder: folder === '.' ? '' : folder,
				raw,
				frontmatter: fm,
				status: typeof fm.status === 'string' ? fm.status : '',
			};
		}
	}
	return null;
};

const setFrontmatterStatus = (raw: string, status: string): string => {
	const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---)/);
	if (!m) return raw;
	const block = m[1] ?? '';
	const next = /^status:/m.test(block)
		? block.replace(/^status:.*$/m, `status: ${status}`)
		: block.replace(/\r?\n---$/, `\nstatus: ${status}\n---`);
	return next + raw.slice(block.length);
};

const readLock = async (
	lockPathAbs: string,
): Promise<{
	version: number;
	stale_after_minutes: number;
	in_flight: any[];
}> => {
	try {
		const parsed = JSON.parse(await readFile(lockPathAbs, 'utf8')) as {
			version?: number;
			stale_after_minutes?: number;
			in_flight?: any[];
		};
		return {
			version: parsed.version ?? 1,
			stale_after_minutes: parsed.stale_after_minutes ?? 10,
			in_flight: Array.isArray(parsed.in_flight) ? parsed.in_flight : [],
		};
	} catch {
		return { version: 1, stale_after_minutes: 10, in_flight: [] };
	}
};

const releaseLock = async (
	lockPathAbs: string,
	taskId: string,
	agent?: string,
): Promise<boolean> =>
	withFileMutex(lockPathAbs, async () => {
		const lock = await readLock(lockPathAbs);
		const before = lock.in_flight.length;
		lock.in_flight = lock.in_flight.filter(
			(entry) =>
				entry.task_id !== taskId ||
				(agent !== undefined && entry.agent !== agent),
		);
		const changed = lock.in_flight.length < before;
		if (changed) {
			await writeFileAtomic(
				lockPathAbs,
				`${JSON.stringify(lock, null, '\t')}\n`,
			);
		}
		return changed;
	});

const moveProposal = async (
	found: ILocatedProposal,
	to: IProposalStatus,
	options: IRecoveryToolOptions,
): Promise<{ movedTo: string; warning?: string }> => {
	const gitRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const filename = found.relPath.split('/').pop() ?? found.relPath;
	const newAbsPath = join(
		options.proposalsDirAbs,
		STATUS_TO_FOLDER[to],
		filename,
	);
	const updated = setFrontmatterStatus(found.raw, to);
	let warning: string | undefined;
	await withFileMutex(found.absPath, async () => {
		await writeFileAtomic(found.absPath, updated);
		if (newAbsPath !== found.absPath) {
			await mkdir(dirname(newAbsPath), { recursive: true });
			const result = await gitRunner(['mv', found.absPath, newAbsPath]);
			if (!result.ok) {
				await rename(found.absPath, newAbsPath);
				warning = `git mv failed (${result.reason ?? 'unknown'}); used plain rename.`;
			}
		}
	});
	return {
		movedTo: relative(options.proposalsDirAbs, newAbsPath),
		...(warning ? { warning } : {}),
	};
};

export const runProposalStaleList = (
	options: IRecoveryToolOptions,
	now = new Date(),
) => {
	const events = (options.eventBuffer ?? createRecoveryEventBuffer())
		.list(now)
		.filter((event) => event.kind === 'agent-dead');
	return toolOk({
		count: events.length,
		zombies: events.map((event) => ({
			...event,
			suggestedActions: [
				'agent_lock_release_orphan',
				'proposal_diagnose',
			],
		})),
	});
};

export const runAgentLockReleaseOrphan = async (
	args: { taskId: string; agent: string; reason: string },
	options: IRecoveryToolOptions,
) => {
	if (args.reason.trim() === '') {
		return toolError('reason is required', 'Pass a non-empty reason.');
	}
	const dead = options.eventBuffer?.findDead(args.agent, args.taskId);
	if (!dead) {
		return toolError(
			'agent is not known dead',
			'Refusing to release a lock without a matching agent-dead event.',
		);
	}
	const released = await releaseLock(
		options.lockPathAbs,
		args.taskId,
		args.agent,
	);
	await createAgentRegistryStore(options.agentRegistryPathAbs).remove(
		args.taskId,
	);
	return toolOk({ taskId: args.taskId, agent: args.agent, released });
};

export const runProposalForceTransition = async (
	args: {
		id: string;
		to: string;
		reason: string;
		overrideLockOwner?: string | undefined;
		taskId?: string | undefined;
	},
	options: IRecoveryToolOptions,
) => {
	if (args.reason.trim() === '') {
		return toolError('reason is required', 'Pass a non-empty reason.');
	}
	if (!isKnownStatus(args.to)) {
		return toolError(
			`unknown status "${args.to}"`,
			`Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		);
	}
	const found = await locateProposal(options.proposalsDirAbs, args.id);
	if (!found) {
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	}
	let lockReleased = false;
	if (args.overrideLockOwner && args.taskId) {
		lockReleased = await releaseLock(
			options.lockPathAbs,
			args.taskId,
			args.overrideLockOwner,
		);
		await createAgentRegistryStore(options.agentRegistryPathAbs).remove(
			args.taskId,
		);
	}
	const moved = await moveProposal(found, args.to, options);
	return toolOk({
		id: args.id,
		from: found.status,
		to: args.to,
		reason: args.reason,
		lockReleased,
		...moved,
	});
};

export const runProposalReconcileFolder = async (
	args: { id: string; dryRun?: boolean | undefined },
	options: IRecoveryToolOptions,
) => {
	const found = await locateProposal(options.proposalsDirAbs, args.id);
	if (!found)
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	if (!isKnownStatus(found.status)) {
		return toolError(
			`proposal status "${found.status}" is not on the f113 state machine`,
			'Migrate legacy proposals first.',
		);
	}
	const expectedFolder = STATUS_TO_FOLDER[found.status];
	if (found.folder === expectedFolder) {
		return toolOk({ id: args.id, changed: false, path: found.relPath });
	}
	if (args.dryRun) {
		const filename = found.relPath.split('/').pop() ?? found.relPath;
		return toolOk({
			id: args.id,
			changed: true,
			dryRun: true,
			from: found.relPath,
			to: `${expectedFolder}/${filename}`,
		});
	}
	const moved = await moveProposal(found, found.status, options);
	return toolOk({ id: args.id, changed: true, ...moved });
};

export const runProposalDiagnose = async (
	args: { id: string; heartbeatMs?: number },
	options: IRecoveryToolOptions,
) => {
	const found = await locateProposal(options.proposalsDirAbs, args.id);
	if (!found)
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	const lock = await readLock(options.lockPathAbs);
	const locks = lock.in_flight.filter((entry) => entry.task_id === args.id);
	const expectedFolder = isKnownStatus(found.status)
		? STATUS_TO_FOLDER[found.status]
		: undefined;
	const inconsistencies: string[] = [];
	if (expectedFolder && found.folder !== expectedFolder) {
		inconsistencies.push('folder-status-mismatch');
	}
	const owner =
		typeof found.frontmatter.owner_agent === 'string'
			? found.frontmatter.owner_agent
			: undefined;
	if (owner && locks.some((entry) => entry.agent !== owner)) {
		inconsistencies.push('lock-owner-mismatch');
	}
	const lastDead = options.eventBuffer
		?.list()
		.find(
			(event) =>
				event.kind === 'agent-dead' &&
				locks.some((entry) => entry.agent === event.agent),
		);
	return toolOk({
		id: args.id,
		file: found.relPath,
		folder: found.folder,
		status: found.status,
		lockOwners: locks.map((entry) => entry.agent),
		lastHeartbeat: locks[0]?.last_seen,
		lastAgentDeadEvent: lastDead,
		inconsistencies,
		suggestedActions:
			inconsistencies.length > 0
				? ['proposal_reconcile_folder']
				: lastDead
					? ['agent_lock_release_orphan', 'proposal_force_transition']
					: [],
	});
};

export const buildRecoveryToolRegistrations = (
	options: IRecoveryToolOptions,
): IToolRegistration[] => {
	const eventBuffer = options.eventBuffer ?? createRecoveryEventBuffer();
	const withBuffer = { ...options, eventBuffer };
	return [
		{
			id: 'proposal_stale_list',
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_proposal_stale_list`,
					{
						description:
							'List proposals whose owner emitted agent-dead from the recovery event buffer.',
						outputSchema: RECOVERY_OUTPUT_SCHEMA,
					},
					async () => runProposalStaleList(withBuffer),
				);
			},
		},
		{
			id: 'agent_lock_release_orphan',
			effects: ['write'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_agent_lock_release_orphan`,
					{
						description:
							'Release an orphan task lock only when a matching agent-dead event exists.',
						outputSchema: RECOVERY_OUTPUT_SCHEMA,
						inputSchema: z.object({
							taskId: z.string().min(1),
							agent: z.string().min(1),
							reason: z.string().min(1),
						}),
					},
					async (args) => runAgentLockReleaseOrphan(args, withBuffer),
				);
			},
		},
		{
			id: 'proposal_force_transition',
			effects: ['write'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_proposal_force_transition`,
					{
						description:
							'Force a proposal to a recovery status with a required reason and optional lock release.',
						outputSchema: RECOVERY_OUTPUT_SCHEMA,
						inputSchema: z.object({
							id: z.string().min(1),
							to: z.string().min(1),
							reason: z.string().min(1),
							overrideLockOwner: z.string().optional(),
							taskId: z.string().optional(),
						}),
					},
					async (args) =>
						runProposalForceTransition(args, withBuffer),
				);
			},
		},
		{
			id: 'proposal_reconcile_folder',
			effects: ['write'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_proposal_reconcile_folder`,
					{
						description:
							'Move one proposal file to the folder that matches its frontmatter status.',
						outputSchema: RECOVERY_OUTPUT_SCHEMA,
						inputSchema: z.object({
							id: z.string().min(1),
							dryRun: z.boolean().optional(),
						}),
					},
					async (args) =>
						runProposalReconcileFolder(args, withBuffer),
				);
			},
		},
		{
			id: 'proposal_diagnose',
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_proposal_diagnose`,
					{
						description:
							'Diagnose proposal folder, status, lock owners, heartbeat, and recovery actions.',
						outputSchema: RECOVERY_OUTPUT_SCHEMA,
						inputSchema: z.object({ id: z.string().min(1) }),
					},
					async (args) => runProposalDiagnose(args, withBuffer),
				);
			},
		},
	];
};
