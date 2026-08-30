import { createHash } from 'node:crypto';

import type { AgentHost } from '@mcp-vertex/core/public';

import { AGENT_CONVENTIONS } from '../shared/agent-conventions';
import { composeIdentity } from '../shared/agent-identity';
import type {
	IValidationActivityParticipant,
	IValidationActivityResolverInput,
	IValidationActivitySignal,
	IValidationActivitySnapshot,
	IValidationActivitySourceKind,
	IValidationActivitySourceState,
	IValidationActivityState,
	IValidationLockEntry,
	IValidationRegistryEntry,
	IValidationWorktreeEntry,
} from './validation-activity.types';

const DEFAULT_SOURCE_STATE: IValidationActivitySourceState = 'missing';
const DEFAULT_STALE_AFTER_MINUTES = AGENT_CONVENTIONS.heartbeat_ttl_minutes;
const AGENT_BRANCH_PREFIX = 'agent/';

interface IResolvedIdentity {
	readonly taskId: string | null;
	readonly agentName: string | null;
	readonly host: AgentHost | null;
	readonly model: string | null;
	readonly identity: string | null;
	readonly branch: string | null;
}

const normalizeText = (value: string | null | undefined): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
};

const normalizePath = (value: string): string =>
	value
		.trim()
		.replace(/\\/gu, '/')
		.replace(/^\.\//u, '')
		.replace(/^\/+?/u, '');

const dedupeStrings = (
	values: readonly (string | null | undefined)[],
): string[] => [
	...new Set(
		values
			.filter((value): value is string => normalizeText(value) !== null)
			.map((value) => normalizeText(value)!),
	),
];

const latestTimestamp = (values: readonly (string | null)[]): string | null => {
	let latest: string | null = null;
	for (const value of values) {
		if (value === null) continue;
		if (latest === null || value > latest) latest = value;
	}
	return latest;
};

const ageMinutesFrom = (
	timestamp: string | null | undefined,
	nowMs: number,
): number | null => {
	const normalized = normalizeText(timestamp);
	if (normalized === null) return null;
	const ts = Date.parse(normalized);
	if (!Number.isFinite(ts)) return null;
	return Math.max(0, Math.round((nowMs - ts) / 60_000));
};

const isExpired = (
	timestamp: string | null | undefined,
	nowMs: number,
): boolean => {
	const normalized = normalizeText(timestamp);
	if (normalized === null) return false;
	const ts = Date.parse(normalized);
	if (!Number.isFinite(ts)) return true;
	return ts <= nowMs;
};

const composeIdentityKey = (input: {
	readonly taskId?: string | null | undefined;
	readonly agentName?: string | null | undefined;
	readonly host?: AgentHost | null | undefined;
	readonly model?: string | null | undefined;
}): string | null => {
	const agentName = normalizeText(input.agentName);
	if (agentName === null) return null;
	return composeIdentity({
		agent_name: agentName,
		...(normalizeText(input.taskId) !== null
			? { task_id: normalizeText(input.taskId)! }
			: {}),
		...(input.host !== undefined && input.host !== null
			? { host: input.host }
			: {}),
		...(normalizeText(input.model) !== null
			? { model: normalizeText(input.model)! }
			: {}),
	});
};

const resolveBranchIdentity = (
	branch: string | null,
): Partial<IResolvedIdentity> => {
	if (branch === null || !branch.startsWith(AGENT_BRANCH_PREFIX)) return {};
	// A branch slug is not a reliable composite identity: names may contain
	// arbitrary hyphens and the parser cannot prove field boundaries. Keep the
	// branch as evidence, but require explicit task/agent metadata to identify
	// the participant and avoid creating phantom actors.
	return { branch };
};

const resolveIdentity = (input: {
	readonly taskId?: string | null | undefined;
	readonly agentName?: string | null | undefined;
	readonly host?: AgentHost | null | undefined;
	readonly model?: string | null | undefined;
	readonly branch?: string | null | undefined;
}): IResolvedIdentity => {
	const branch = normalizeText(input.branch);
	const fromBranch = resolveBranchIdentity(branch);
	const taskId = normalizeText(input.taskId) ?? fromBranch.taskId ?? null;
	const agentName =
		normalizeText(input.agentName) ?? fromBranch.agentName ?? null;
	const host = input.host ?? fromBranch.host ?? null;
	const model = normalizeText(input.model) ?? fromBranch.model ?? null;
	return {
		taskId,
		agentName,
		host,
		model,
		identity:
			composeIdentityKey({ taskId, agentName, host, model }) ??
			fromBranch.identity ??
			null,
		branch: branch ?? fromBranch.branch ?? null,
	};
};

const buildSignal = (input: {
	readonly source: IValidationActivitySourceKind;
	readonly state: IValidationActivityState;
	readonly reason: string;
	readonly taskId?: string | null;
	readonly agentName?: string | null;
	readonly host?: AgentHost | null;
	readonly model?: string | null;
	readonly lastSeen?: string | null;
	readonly ownedFiles?: readonly string[] | undefined;
	readonly branch?: string | null | undefined;
	readonly worktreePath?: string | null | undefined;
	readonly nowMs: number;
}): IValidationActivitySignal => {
	const resolved = resolveIdentity(input);
	const lastSeen = normalizeText(input.lastSeen);
	return {
		source: input.source,
		state: input.state,
		reason: input.reason,
		taskId: resolved.taskId,
		agentName: resolved.agentName,
		identity: resolved.identity,
		host: resolved.host,
		model: resolved.model,
		lastSeen,
		ageMinutes: ageMinutesFrom(lastSeen, input.nowMs),
		ownedFiles: (input.ownedFiles ?? []).map(normalizePath),
		branch: resolved.branch,
		worktreePath: normalizeText(input.worktreePath),
	};
};

const resolveRegistrySignals = (
	entries: readonly IValidationRegistryEntry[],
	nowMs: number,
	staleAfterMinutes: number,
): IValidationActivitySignal[] =>
	entries.map((entry) => {
		const taskId = normalizeText(entry.task_id);
		const agentName = normalizeText(entry.agent_name);
		const lastSeen = normalizeText(entry.last_seen);
		const ageMinutes = ageMinutesFrom(lastSeen, nowMs);
		if (taskId === null || agentName === null) {
			return buildSignal({
				source: 'registry',
				state: 'corrupt',
				reason: 'registry entry is missing task_id or agent_name',
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				nowMs,
			});
		}
		if (lastSeen === null || ageMinutes === null) {
			return buildSignal({
				source: 'registry',
				state: 'corrupt',
				reason: 'registry entry has an invalid last_seen timestamp',
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				nowMs,
			});
		}
		if (entry.status !== 'active') {
			return buildSignal({
				source: 'registry',
				state: 'stale',
				reason: `registry status ${entry.status ?? 'unknown'} is not active`,
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				nowMs,
			});
		}
		if (entry.adopted !== true) {
			return buildSignal({
				source: 'registry',
				state: 'stale',
				reason: 'registry entry is not adopted',
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				nowMs,
			});
		}
		if (
			ageMinutes >= staleAfterMinutes ||
			isExpired(entry.lease_until ?? null, nowMs)
		) {
			return buildSignal({
				source: 'registry',
				state: 'stale',
				reason: 'registry heartbeat or lease is stale',
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				nowMs,
			});
		}
		return buildSignal({
			source: 'registry',
			state: 'active',
			reason: 'registry heartbeat is current',
			taskId,
			agentName,
			host: entry.host ?? null,
			model: entry.model ?? null,
			lastSeen,
			nowMs,
		});
	});

const resolveLockSignals = (
	entries: readonly IValidationLockEntry[],
	nowMs: number,
	staleAfterMinutes: number,
): IValidationActivitySignal[] =>
	entries.map((entry) => {
		const taskId = normalizeText(entry.task_id);
		const agentName = normalizeText(entry.agent);
		const lastSeen = normalizeText(entry.last_seen);
		const ageMinutes = ageMinutesFrom(lastSeen, nowMs);
		if (taskId === null && agentName === null) {
			return buildSignal({
				source: 'lock',
				state: 'corrupt',
				reason: 'lock entry is missing both task_id and agent',
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				ownedFiles: entry.ownership ?? [],
				nowMs,
			});
		}
		if (lastSeen === null || ageMinutes === null) {
			return buildSignal({
				source: 'lock',
				state: 'corrupt',
				reason: 'lock entry has an invalid last_seen timestamp',
				taskId,
				agentName,
				host: entry.host ?? null,
				model: entry.model ?? null,
				lastSeen,
				ownedFiles: entry.ownership ?? [],
				nowMs,
			});
		}
		return buildSignal({
			source: 'lock',
			state: ageMinutes < staleAfterMinutes ? 'active' : 'stale',
			reason:
				ageMinutes < staleAfterMinutes
					? 'lock heartbeat is current'
					: 'lock heartbeat is stale',
			taskId,
			agentName,
			host: entry.host ?? null,
			model: entry.model ?? null,
			lastSeen,
			ownedFiles: entry.ownership ?? [],
			nowMs,
		});
	});

const resolveWorktreeSignals = (
	entries: readonly IValidationWorktreeEntry[],
	nowMs: number,
	staleAfterMinutes: number,
): IValidationActivitySignal[] =>
	entries.map((entry) => {
		const branch = normalizeText(entry.branch);
		const taskId = normalizeText(entry.taskId);
		const agentName = normalizeText(entry.agentName);
		const lastSeen = normalizeText(entry.lastSeen);
		const ageMinutes = ageMinutesFrom(lastSeen, nowMs);
		const identity = resolveIdentity({
			taskId,
			agentName,
			host: entry.host ?? null,
			model: entry.model ?? null,
			branch,
		});
		if (
			branch === null &&
			identity.taskId === null &&
			identity.agentName === null
		) {
			return buildSignal({
				source: 'worktree',
				state: 'corrupt',
				reason: 'worktree entry is missing branch and actor identity',
				lastSeen,
				worktreePath: entry.path ?? null,
				nowMs,
			});
		}
		if (lastSeen !== null && ageMinutes === null) {
			return buildSignal({
				source: 'worktree',
				state: 'corrupt',
				reason: 'worktree entry has an invalid lastSeen timestamp',
				taskId: identity.taskId,
				agentName: identity.agentName,
				host: identity.host,
				model: identity.model,
				branch,
				lastSeen,
				worktreePath: entry.path ?? null,
				nowMs,
			});
		}
		const isLive =
			lastSeen !== null &&
			ageMinutes !== null &&
			ageMinutes < staleAfterMinutes &&
			(identity.taskId !== null || identity.agentName !== null);
		return buildSignal({
			source: 'worktree',
			state: isLive ? 'active' : 'stale',
			reason: isLive
				? 'worktree activity is current'
				: identity.taskId === null && identity.agentName === null
					? 'worktree branch has no explicit actor identity'
					: 'worktree alone does not prove current activity',
			taskId: identity.taskId,
			agentName: identity.agentName,
			host: identity.host,
			model: identity.model,
			branch,
			lastSeen,
			worktreePath: entry.path ?? null,
			nowMs,
		});
	});

const shouldMergeSignals = (
	left: IValidationActivitySignal,
	right: IValidationActivitySignal,
): boolean => {
	if (left.taskId !== null && left.taskId === right.taskId) return true;
	if (left.identity !== null && left.identity === right.identity) return true;
	return false;
};

const buildGroups = (
	signals: readonly IValidationActivitySignal[],
): IValidationActivitySignal[][] => {
	const parent = signals.map((_, index) => index);
	const find = (index: number): number => {
		let cursor = index;
		while (parent[cursor] !== cursor) {
			parent[cursor] = parent[parent[cursor]!]!;
			cursor = parent[cursor]!;
		}
		return cursor;
	};
	const unite = (left: number, right: number): void => {
		const rootLeft = find(left);
		const rootRight = find(right);
		if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
	};
	for (let index = 0; index < signals.length; index += 1) {
		for (let other = index + 1; other < signals.length; other += 1) {
			if (shouldMergeSignals(signals[index]!, signals[other]!)) {
				unite(index, other);
			}
		}
	}
	const groups = new Map<number, IValidationActivitySignal[]>();
	for (let index = 0; index < signals.length; index += 1) {
		const root = find(index);
		const existing = groups.get(root);
		if (existing === undefined) groups.set(root, [signals[index]!]);
		else existing.push(signals[index]!);
	}
	return [...groups.values()];
};

const summarizeGroup = (
	group: readonly IValidationActivitySignal[],
): IValidationActivityParticipant => {
	const liveSignals = group.filter((signal) => signal.state === 'active');
	const taskIds = dedupeStrings(group.map((signal) => signal.taskId));
	const agentNames = dedupeStrings(group.map((signal) => signal.agentName));
	const hosts = dedupeStrings(group.map((signal) => signal.host));
	const models = dedupeStrings(group.map((signal) => signal.model));
	const identities = dedupeStrings(group.map((signal) => signal.identity));
	const branches = dedupeStrings(group.map((signal) => signal.branch));
	const worktreePaths = dedupeStrings(
		group.map((signal) => signal.worktreePath),
	);
	const ownedFiles = dedupeStrings(
		group.flatMap((signal) => signal.ownedFiles),
	);
	const lastSeen = latestTimestamp(group.map((signal) => signal.lastSeen));
	const ageMinutes =
		group
			.map((signal) => signal.ageMinutes)
			.filter((value): value is number => typeof value === 'number')
			.sort((left, right) => left - right)[0] ?? null;
	const sourceStates = new Set(group.map((signal) => signal.state));
	const conflictingTasks = taskIds.length > 1;
	const conflictingAgents = agentNames.length > 1;
	const conflictingHosts = hosts.length > 1;
	const conflictingModels = models.length > 1;
	const hasCorruptSignal = sourceStates.has('corrupt');
	const state: IValidationActivityState = hasCorruptSignal
		? 'corrupt'
		: conflictingTasks ||
				conflictingAgents ||
				conflictingHosts ||
				conflictingModels
			? 'corrupt'
			: liveSignals.length > 0
				? 'active'
				: sourceStates.has('stale')
					? 'stale'
					: 'missing';
	const reason = hasCorruptSignal
		? 'one or more activity signals are corrupt'
		: conflictingTasks
			? 'signals disagree on task identity'
			: conflictingAgents
				? 'signals disagree on agent identity'
				: conflictingHosts || conflictingModels
					? 'signals disagree on host or model identity'
					: liveSignals.length > 0
						? 'at least one corroborated live signal is active'
						: sourceStates.has('stale')
							? 'only stale signals remain for this actor'
							: 'activity cannot be proven from the available signals';
	const taskId = taskIds[0] ?? null;
	const agentName = agentNames[0] ?? null;
	const host = (hosts[0] as AgentHost | undefined) ?? null;
	const model = models[0] ?? null;
	const identity =
		composeIdentityKey({ taskId, agentName, host, model }) ??
		identities[0] ??
		null;
	const key =
		taskId !== null
			? `task:${taskId}`
			: identity !== null
				? `identity:${identity}`
				: `signal:${createHash('sha1').update(JSON.stringify(group)).digest('hex').slice(0, 12)}`;
	return {
		key,
		state,
		reason,
		taskId,
		agentName,
		identity,
		host,
		model,
		lastSeen,
		ageMinutes,
		ownedFiles,
		branches,
		worktreePaths,
		signals: [...group],
		activeSources: dedupeStrings(
			liveSignals.map((signal) => signal.source),
		) as IValidationActivitySourceKind[],
	};
};

const currentActorKeyOf = (
	agents: readonly IValidationActivityParticipant[],
	input: IValidationActivityResolverInput['current'],
): string | null => {
	if (input === undefined) return null;
	const resolved = resolveIdentity({
		taskId: input.taskId ?? null,
		...(input.agentName !== undefined
			? { agentName: input.agentName }
			: {}),
		host: input.host ?? null,
		model: input.model ?? null,
		branch: input.branch ?? null,
	});
	if (resolved.taskId !== null) {
		const match = agents.find((agent) => agent.taskId === resolved.taskId);
		if (match !== undefined) return match.key;
	}
	if (resolved.identity !== null) {
		const match = agents.find(
			(agent) => agent.identity === resolved.identity,
		);
		if (match !== undefined) return match.key;
	}
	return null;
};

const snapshotStateOf = (
	agents: readonly IValidationActivityParticipant[],
	sourceStates: Readonly<
		Record<IValidationActivitySourceKind, IValidationActivitySourceState>
	>,
): IValidationActivityState => {
	if (Object.values(sourceStates).includes('corrupt')) return 'corrupt';
	if (agents.some((agent) => agent.state === 'corrupt')) return 'corrupt';
	if (agents.some((agent) => agent.state === 'active')) return 'active';
	if (agents.some((agent) => agent.state === 'stale')) return 'stale';
	return 'missing';
};

export const resolveValidationActivitySnapshot = (
	input: IValidationActivityResolverInput,
): IValidationActivitySnapshot => {
	const now = normalizeText(input.now) ?? new Date().toISOString();
	const nowMs = Date.parse(now);
	const staleAfterMinutes =
		input.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES;
	const registrySignals =
		input.registry?.state === 'ok'
			? resolveRegistrySignals(
					input.registry.entries ?? [],
					nowMs,
					staleAfterMinutes,
				)
			: [];
	const lockSignals =
		input.locks?.state === 'ok'
			? resolveLockSignals(
					input.locks.entries ?? [],
					nowMs,
					staleAfterMinutes,
				)
			: [];
	const worktreeSignals =
		input.worktrees?.state === 'ok'
			? resolveWorktreeSignals(
					input.worktrees.entries ?? [],
					nowMs,
					staleAfterMinutes,
				)
			: [];
	const sourceStates: Readonly<
		Record<IValidationActivitySourceKind, IValidationActivitySourceState>
	> = {
		registry: input.registry?.state ?? DEFAULT_SOURCE_STATE,
		lock: input.locks?.state ?? DEFAULT_SOURCE_STATE,
		worktree: input.worktrees?.state ?? DEFAULT_SOURCE_STATE,
	};
	const signals = [...registrySignals, ...lockSignals, ...worktreeSignals];
	const agents = buildGroups(signals)
		.map(summarizeGroup)
		.sort((left, right) => left.key.localeCompare(right.key));
	const currentActorKey = currentActorKeyOf(agents, input.current);
	const activeAgents = agents.filter((agent) => agent.state === 'active');
	const activeTasks = dedupeStrings(
		activeAgents.map((agent) => agent.taskId),
	);
	const evidenceAgeMinutes =
		activeAgents
			.map((agent) => agent.ageMinutes)
			.filter((value): value is number => typeof value === 'number')
			.sort((left, right) => left - right)[0] ?? null;
	const reasons = [
		...new Set([
			...agents
				.filter((agent) => agent.state === 'corrupt')
				.map((agent) => `${agent.key}: ${agent.reason}`),
			...Object.entries(sourceStates)
				.filter(([, state]) => state !== 'ok')
				.map(([source, state]) => `${source} source is ${state}`),
		]),
	];
	const summary = {
		activeAgents: activeAgents.length,
		activeTasks: activeTasks.length,
		activeLocks: lockSignals.filter((signal) => signal.state === 'active')
			.length,
		activeWorktrees: worktreeSignals.filter(
			(signal) => signal.state === 'active',
		).length,
		evidenceAgeMinutes,
	};
	const snapshot: IValidationActivitySnapshot = {
		snapshotId: '',
		createdAt: now,
		state: snapshotStateOf(agents, sourceStates),
		consistent: reasons.length === 0,
		currentActorKey,
		sourceStates,
		agents,
		summary,
		reasons,
	};
	const snapshotId = createHash('sha1')
		.update(
			JSON.stringify({
				createdAt: snapshot.createdAt,
				state: snapshot.state,
				currentActorKey: snapshot.currentActorKey,
				sourceStates: snapshot.sourceStates,
				agents: snapshot.agents.map((agent) => ({
					key: agent.key,
					state: agent.state,
					taskId: agent.taskId,
					agentName: agent.agentName,
					identity: agent.identity,
					lastSeen: agent.lastSeen,
					ownedFiles: [...agent.ownedFiles].sort(),
					branches: [...agent.branches].sort(),
					worktreePaths: [...agent.worktreePaths].sort(),
				})),
			}),
		)
		.digest('hex')
		.slice(0, 16);
	return { ...snapshot, snapshotId };
};
