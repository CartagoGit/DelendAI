import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import z from 'zod';

import {
	planDryRun,
	safeRename,
	toolError,
	toolJson,
	toolOk,
	withFileMutex,
	writeFileAtomic,
	type IToolRegistration,
} from '@delendai/core/public';

import {
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
	doneFolderFor,
	type IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { locateProposal as locateSharedProposal } from '../proposals/locate';
import { setFrontmatterStatus as sharedSetFrontmatterStatus } from '../proposals/proposal-frontmatter-writer';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import { createAgentRegistryStore } from '../shared/agent-registry-store';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { purgeStaleLocks } from '../shared/purge-stale-locks';
import { hasIndependentPeerApproval } from './proposal-transition.tool';
import { recordPeerReviewBypass } from '../shared/peer-review-bypass-log';
import { removeStale, type ILockFile } from '../locks/agent-lock-engine';
import { guardDoneToReviewRegression } from '../services/proposal-state';
/** Lock-file schema version written when no lock exists yet. */
const DEFAULT_LOCK_VERSION = 1;
/** Minutes after which an unrefreshed claim is considered abandoned. */
const DEFAULT_STALE_AFTER_MINUTES = 10;

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
	readonly indexPathAbs: string;
	readonly proposalsDirAbs: string;
	readonly lockPathAbs: string;
	readonly agentRegistryPathAbs: string;
	readonly workspaceRoot: string;
	readonly eventBuffer?: IRecoveryEventBuffer;
	readonly gitRunner?: IGitRunner;
	/** a00069 S7: peer-review gate default on for force review→done. */
	readonly requirePeerReview?: boolean;
	/** Optional paths to the agent queue (used by recovery tools). */
	readonly queuePathAbs?: string;
	readonly closedTasksPathAbs?: string;
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

// Each of the 5 recovery tools below used to share one 30-field
// kitchen-sink output schema, so every tool advertised (and paid wire
// bytes for) every OTHER tool's fields too — e.g. `proposal_stale_list`
// declared `to`/`from`/`movedTo`/`lockReleased` even though it never
// returns them. These are sized to exactly what each handler returns
// (`runProposalStaleList` / `runAgentLockReleaseOrphan` / etc. below),
// so no capability is lost — a tool simply no longer advertises fields
// it could never produce. Error results short-circuit via `toolError`/
// `buildRecoveryCodeError` with `isError: true`, which the MCP SDK never
// validates against `outputSchema`, so these success-shaped schemas
// don't need to model the failure envelope.
const STALE_LIST_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	count: z.number(),
	zombies: z.array(STALE_PROPOSAL_SCHEMA),
});

const RELEASE_ORPHAN_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	taskId: z.string(),
	agent: z.string(),
	released: z.boolean(),
});

export const FORCE_TRANSITION_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	id: z.string(),
	from: z.string(),
	to: z.string(),
	reason: z.string(),
	lockReleased: z.boolean(),
	movedTo: z.string(),
	warning: z.string().optional(),
});

export const FORCE_TRANSITION_INPUT_SCHEMA = z.object({
	id: z.string().min(1),
	to: z.string().min(1),
	reason: z.string().min(1),
	overrideLockOwner: z.string().optional(),
	taskId: z.string().optional(),
	skipPeerReview: z.boolean().optional(),
});

const RECONCILE_FOLDER_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	id: z.string(),
	changed: z.boolean().optional(),
	path: z.string().optional(),
	dryRun: z.boolean().optional(),
	wouldChange: z
		.array(
			z.object({
				kind: z.enum(['write', 'delete', 'rename', 'create', 'patch']),
				path: z.string(),
				summary: z.string(),
			}),
		)
		.optional(),
	wouldRun: z
		.array(
			z.object({
				shape: z.enum(['shell', 'network', 'process', 'git', 'mcp']),
				target: z.string(),
				summary: z.string(),
			}),
		)
		.optional(),
	risk: z.enum(['low', 'medium', 'high']).optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
});

const DIAGNOSE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	id: z.string(),
	file: z.string(),
	folder: z.string(),
	status: z.string(),
	lockOwners: z.array(z.string()),
	staleTaskIds: z.array(z.string()),
	lastHeartbeat: z.string().optional(),
	lastAgentDeadEvent: RECOVERY_EVENT_SCHEMA.optional(),
	inconsistencies: z.array(z.string()),
	suggestedActions: z.array(z.string()),
	// Cross-proposal stale locks the smoke detector
	// saw when running. When non-empty the host should run
	// `state_repair { mode: "execute" }` (or call
	// `agent_lock_release_orphan` for a targeted release).
	crossProposal: z.boolean().optional(),
	crossProposalStaleTaskIds: z.array(z.string()),
	crossProposalStaleAgents: z.array(z.string()),
});

const matchesProposalTask = (proposalId: string, taskId: string): boolean =>
	taskId === proposalId || taskId.startsWith(`${proposalId}-`);

const taskProposalId = (taskId: string): string => {
	const sliceIndex = taskId.indexOf('-S');
	return sliceIndex === -1 ? taskId : taskId.slice(0, sliceIndex);
};

const locateProposal = async (
	options: Pick<IRecoveryToolOptions, 'indexPathAbs' | 'proposalsDirAbs'>,
	id: string,
): Promise<ILocatedProposal | null> => {
	// Use the shared index-first resolver so recovery tools address the
	// same proposals as proposal_get and proposal_review. The local
	// wrapper just adds
	// the `raw` + `frontmatter` fields the recovery tools need.
	const located = await locateSharedProposal(id, {
		indexPathAbs: options.indexPathAbs,
		proposalsDirAbs: options.proposalsDirAbs,
	});
	if (located === null) return null;
	const raw = (await readTextOrNull(located.absPath)) ?? '';
	const block = extractYamlBlock(raw);
	const frontmatter =
		block === null
			? {}
			: (parseFrontmatterBlock(block) as Record<string, unknown>);
	return {
		absPath: located.absPath,
		relPath: relative(options.proposalsDirAbs, located.absPath),
		folder: located.folder,
		raw,
		frontmatter,
		status: located.status,
	};
};

const setFrontmatterStatus = (raw: string, status: string): string => {
	// Behaviour-preserving wrapper around the shared frontmatter
	// writer. The local copy used to insert a new `status:` line when
	// missing; the shared writer does the same, so the behaviour is
	// equivalent for both branches (replace-if-present, append-if-not).
	// Kept as a named alias so the recovery-tool call sites read
	// consistently with the rest of this file.
	return updateStatusLine(raw, status);
};

/**
 * Behaviour-preserving replacement for the pre-refactor local
 * `setFrontmatterStatus`: when the frontmatter already has a `status:`
 * line, replace it in place; otherwise append a new line just before
 * the closing `---`. The shared `setFrontmatterStatus` only handles
 * the in-place case, so we layer the append behaviour on top of it.
 */
const updateStatusLine = (raw: string, status: string): string => {
	if (/^status:/m.test(extractFrontmatterBlock(raw) ?? '')) {
		return sharedSetFrontmatterStatus(raw, status);
	}
	const block = extractFrontmatterBlock(raw);
	if (block === null) return raw;
	const next = block.replace(/\r?\n---$/, `\nstatus: ${status}\n---`);
	return next + raw.slice(block.length);
};

/** Pull the YAML frontmatter block (between `---` markers) out of a raw blob. */
const extractFrontmatterBlock = (raw: string): string | null => {
	const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---)/);
	return m === null ? null : (m[1] ?? '');
};

const readLock = async (lockPathAbs: string): Promise<ILockFile> => {
	const parsed = await readJsonOrNull<Partial<ILockFile>>(lockPathAbs);
	if (parsed === null) {
		return {
			version: DEFAULT_LOCK_VERSION,
			stale_after_minutes: DEFAULT_STALE_AFTER_MINUTES,
			in_flight: [],
		};
	}
	return {
		version: parsed.version ?? DEFAULT_LOCK_VERSION,
		stale_after_minutes:
			parsed.stale_after_minutes ?? DEFAULT_STALE_AFTER_MINUTES,
		in_flight: Array.isArray(parsed.in_flight) ? parsed.in_flight : [],
	};
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

/**
 * Resolve the folder a closed proposal should land in given its raw
 * frontmatter. Used by both `runProposalForceTransition` (forward
 * motion: status → done) and `runProposalReconcileFolder` (back-fill
 * motion: misfiled → correct folder for the current status). The kind
 * is read once from the markdown so both paths agree.
 *
 * Pure I/O (one read): safe to call from both entry points without
 * trampling the frontmatter.
 */
const resolveDoneFolderFromRaw = async (
	found: ILocatedProposal,
	status: IProposalStatus,
): Promise<string> => {
	if (status !== 'done') return STATUS_TO_FOLDER[status];
	const block = extractYamlBlock(found.raw);
	const fm = block === null ? {} : parseFrontmatterBlock(block);
	const kindRaw = typeof fm.kind === 'string' ? fm.kind : undefined;
	const knownKinds = new Set([
		'feat',
		'breaking',
		'fix',
		'refactor',
		'perf',
		'audit',
		'chore',
		'docs',
		'test',
		'infra',
		'spike',
		'legacy',
		'resume',
		'plan',
	]);
	const kind =
		kindRaw !== undefined && knownKinds.has(kindRaw)
			? (kindRaw as Parameters<typeof doneFolderFor>[0])
			: undefined;
	return doneFolderFor(kind);
};

const moveProposal = async (
	found: ILocatedProposal,
	to: IProposalStatus,
	targetFolder: string,
	options: IRecoveryToolOptions,
): Promise<{ movedTo: string; warning?: string }> => {
	const gitRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const filename = found.relPath.split('/').pop() ?? found.relPath;
	const newAbsPath = join(options.proposalsDirAbs, targetFolder, filename);
	const updated = setFrontmatterStatus(found.raw, to);
	let warning: string | undefined;
	await withFileMutex(found.absPath, async () => {
		await writeFileAtomic(found.absPath, updated);
		if (newAbsPath !== found.absPath) {
			await mkdir(dirname(newAbsPath), { recursive: true });
			// Untracked file → plain rename + stage, no warning
			// (nothing to preserve); the warning is for tracked-file mv
			// failures only. Mirrors proposal-transition.tool.ts.
			const tracked = await gitRunner([
				'ls-files',
				'--error-unmatch',
				found.absPath,
			]);
			if (!tracked.ok) {
				await safeRename(found.absPath, newAbsPath);
				await gitRunner(['add', newAbsPath]);
			} else {
				const result = await gitRunner([
					'mv',
					found.absPath,
					newAbsPath,
				]);
				if (!result.ok) {
					// Best-effort fallback after `git mv` refused —
					// `safeRename` keeps blame but refuses to clobber
					// an existing destination; collision bubbles up
					// as a typed error that the outer caller can map
					// to a `toolError`.
					try {
						await safeRename(found.absPath, newAbsPath);
						warning = `git mv failed (${result.reason ?? 'unknown'}); used plain rename.`;
					} catch (collision) {
						throw new Error(
							`cannot complete recovery: target already exists at ${newAbsPath} and git mv was unavailable (${result.reason ?? 'unknown'}). Resolve by hand and retry.`,
							{ cause: collision },
						);
					}
				}
			}
		}
	});
	return {
		movedTo: relative(options.proposalsDirAbs, newAbsPath),
		...(warning ? { warning } : {}),
	};
};

// Route the local error helper through `toolJson` so the
// envelope (text + structuredContent) is produced by the same helper
// as `toolOk` / `toolError`, and stamp `isError: true` to match
// `toolError`'s contract.
const buildRecoveryCodeError = (code: string, reason: string) => {
	const envelope = { ok: false as const, error: { code, reason } };
	return {
		...toolJson(envelope),
		isError: true,
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
		/** a00069 S7: host-approved bypass of the peer-review gate. */
		skipPeerReview?: boolean | undefined;
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
	const found = await locateProposal(options, args.id);
	if (!found) {
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	}
	// force_transition without skipPeerReview still needs peer approve
	// when moving review → done (same gate as proposal_transition).
	// skipPeerReview bypass is audited (reason already required).
	const requirePeer = options.requirePeerReview !== false;
	if (requirePeer && args.to === 'done' && found.status === 'review') {
		if (args.skipPeerReview === true) {
			recordPeerReviewBypass({
				proposalId: args.id,
				reason: args.reason,
				via: 'skipPeerReview',
				...(args.overrideLockOwner
					? { agent: args.overrideLockOwner }
					: {}),
			});
		} else if (!hasIndependentPeerApproval(found.raw)) {
			return toolError(
				`peer-review required before force_transition of "${args.id}" review → done`,
				`Run ${options.namespacePrefix}_proposal_review { action: "approve", agent: "<reviewer≠implementer>" } first, or pass skipPeerReview:true only with host approval.`,
			);
		}
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
	const targetFolder = await resolveDoneFolderFromRaw(found, args.to);
	const moved = await moveProposal(found, args.to, targetFolder, options);
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
	args: {
		id: string;
		dryRun?: boolean | undefined;
		force?: boolean | undefined;
		reason?: string | undefined;
	},
	options: IRecoveryToolOptions,
) => {
	const found = await locateProposal(options, args.id);
	if (!found)
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	if (!isKnownStatus(found.status)) {
		return toolError(
			`proposal status "${found.status}" is not on the f00016 state machine`,
			'Migrate legacy proposals first.',
		);
	}
	const expectedFolder = await resolveDoneFolderFromRaw(found, found.status);
	if (found.folder === expectedFolder) {
		return toolOk({ id: args.id, changed: false, path: found.relPath });
	}
	if (found.folder === 'done' && expectedFolder === 'review') {
		const guard = guardDoneToReviewRegression({
			from: 'done',
			to: 'review',
			force: args.force,
			reason: args.reason,
		});
		if (!guard.ok) {
			return buildRecoveryCodeError(guard.code, guard.reason);
		}
	}
	if (args.dryRun) {
		const filename = found.relPath.split('/').pop() ?? found.relPath;
		return toolOk({
			id: args.id,
			...planDryRun({
				wouldChange: [
					{
						kind: 'rename',
						path: found.relPath,
						summary: `move proposal ${args.id} to ${expectedFolder}/${filename}`,
					},
				],
				wouldRun: [
					{
						shape: 'mcp',
						target: 'proposal_reconcile_folder',
						summary: `move ${args.id} only after the dry-run plan is approved`,
					},
				],
				risk: 'medium',
			}),
		});
	}
	const moved = await moveProposal(
		found,
		found.status,
		expectedFolder,
		options,
	);
	return toolOk({ id: args.id, changed: true, ...moved });
};

export const runProposalDiagnose = async (
	args: {
		id: string;
		heartbeatMs?: number;
		caller?: string | undefined;
		crossProposal?: boolean | undefined;
	},
	options: IRecoveryToolOptions,
) => {
	const found = await locateProposal(options, args.id);
	if (!found)
		return toolError(`proposal "${args.id}" not found`, 'Check the id.');
	const lock = await readLock(options.lockPathAbs);
	const cleaned = removeStale(lock);
	const staleEntries = lock.in_flight.filter(
		(entry) => !cleaned.in_flight.includes(entry),
	);
	await purgeStaleLocks({ lockPath: options.lockPathAbs });
	const activeLock = await readLock(options.lockPathAbs);
	const proposalLocks = lock.in_flight.filter((entry) =>
		matchesProposalTask(args.id, entry.task_id),
	);
	const staleTaskIdSet = new Set(staleEntries.map((entry) => entry.task_id));
	const includeCrossProposal =
		args.crossProposal === true || args.caller === 'auto_work';
	const crossProposalStaleEntries = includeCrossProposal
		? staleEntries.filter((e) => taskProposalId(e.task_id) !== args.id)
		: [];
	const locks = includeCrossProposal
		? activeLock.in_flight.filter(
				(entry) =>
					matchesProposalTask(args.id, entry.task_id) ||
					taskProposalId(entry.task_id) !== args.id,
			)
		: activeLock.in_flight.filter((entry) =>
				matchesProposalTask(args.id, entry.task_id),
			);
	const crossProposal = crossProposalStaleEntries.length > 0;
	const staleTaskIds = [
		...new Set(
			[...proposalLocks, ...crossProposalStaleEntries]
				.filter((entry) => staleTaskIdSet.has(entry.task_id))
				.map((entry) => entry.task_id),
		),
	];
	const expectedFolder = isKnownStatus(found.status)
		? await resolveDoneFolderFromRaw(found, found.status)
		: undefined;
	const inconsistencies: string[] = [];
	if (expectedFolder && found.folder !== expectedFolder) {
		inconsistencies.push('folder-status-mismatch');
	}
	const owner =
		typeof found.frontmatter.owner_agent === 'string'
			? found.frontmatter.owner_agent
			: undefined;
	if (owner && proposalLocks.some((entry) => entry.agent !== owner)) {
		inconsistencies.push('lock-owner-mismatch');
	}
	if (crossProposal) {
		inconsistencies.push('cross-proposal-stale-locks');
	}
	const lastDead = options.eventBuffer
		?.list()
		.find(
			(event) =>
				event.kind === 'agent-dead' &&
				locks.some((entry) => entry.agent === event.agent),
		);
	const suggestedActions: string[] = [];
	if (inconsistencies.includes('folder-status-mismatch')) {
		suggestedActions.push('proposal_reconcile_folder');
	}
	if (inconsistencies.includes('lock-owner-mismatch')) {
		suggestedActions.push('agent_lock_release_orphan');
	}
	if (staleTaskIds.length > 0) {
		suggestedActions.push(
			staleTaskIds.length <= 3
				? 'agent_lock_release_orphan'
				: 'state_repair',
		);
	}
	if (lastDead && suggestedActions.length === 0) {
		suggestedActions.push(
			'agent_lock_release_orphan',
			'proposal_force_transition',
		);
	}
	// Success envelope is `{ ok: true, ...payload }` so the
	// contract matches `toolError` and the modern MCP client can read
	// `ok` from `structuredContent` without re-parsing the text.
	return toolOk({
		ok: true,
		id: args.id,
		file: found.relPath,
		folder: found.folder,
		status: found.status,
		lockOwners: [...new Set(locks.map((entry) => entry.agent))],
		staleTaskIds,
		lastHeartbeat: proposalLocks[0]?.last_seen ?? locks[0]?.last_seen,
		lastAgentDeadEvent: lastDead,
		inconsistencies,
		suggestedActions,
		...(crossProposal ? { crossProposal: true } : {}),
		crossProposalStaleTaskIds: crossProposalStaleEntries.map(
			(e) => e.task_id,
		),
		crossProposalStaleAgents: crossProposalStaleEntries.map((e) => e.agent),
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
						outputSchema: STALE_LIST_OUTPUT_SCHEMA,
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
						outputSchema: RELEASE_ORPHAN_OUTPUT_SCHEMA,
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
							'Force a proposal to a recovery status with a required reason and optional lock release. a00069 S7: review→done still requires peer approve unless skipPeerReview:true.',
						outputSchema: FORCE_TRANSITION_OUTPUT_SCHEMA,
						inputSchema: FORCE_TRANSITION_INPUT_SCHEMA,
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
						outputSchema: RECONCILE_FOLDER_OUTPUT_SCHEMA,
						inputSchema: z.object({
							id: z.string().min(1),
							dryRun: z.boolean().optional(),
							force: z.boolean().optional(),
							reason: z.string().optional(),
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
						outputSchema: DIAGNOSE_OUTPUT_SCHEMA,
						inputSchema: z.object({
							id: z.string().min(1),
							caller: z.string().optional(),
							crossProposal: z.boolean().optional(),
						}),
					},
					async (args) => runProposalDiagnose(args, withBuffer),
				);
			},
		},
	];
};
