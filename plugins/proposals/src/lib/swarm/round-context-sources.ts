/**
 * round-context-sources.ts
 *
 * Filesystem-aware readers for the operational sidecar files (lock,
 * checkpoint, chat-context, registry, proposal index) and the
 * `collectRoundContextSnapshot` aggregator that turns them into a stable
 * `IRoundContextOperationalSnapshot` (N20 split of the former monolithic
 * `round-context.ts`).
 *
 * These functions read the workspace but never write — the digest
 * lifecycle (atomic .tmp + rename) lives in `round-context-digest.ts`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import type { IYamlValue } from '../proposals/frontmatter-parser';
import type { IAgentAssignment } from '../shared/agent-registry-store';
import { AGENT_CONVENTIONS } from '../shared/agent-conventions';
import { CONTINUITY_STALE_WINDOW_MS } from './runtime-recovery';
import { computeAgeMinutes, computeFingerprint } from './round-context-hash';
import {
	ACTIVE_PROPOSAL_PREVIEW_LIMIT,
} from './round-context-types';
import type {
	IRoundContextAgent,
	IRoundContextChatContext,
	IRoundContextCheckpoint,
	IRoundContextLock,
	IRoundContextProposalPortfolio,
	IRoundContextSourceMeta,
	IRoundContextSourceState,
	IRoundContextSources,
} from './round-context-types';

interface IJsonChatContext {
	readonly proposalIds?: readonly string[];
	readonly topic?: string;
	readonly lastUpdated?: string;
}

interface IJsonCheckpoint {
	readonly proposalId?: string;
	readonly status?: string;
	readonly updatedAt?: string;
	readonly lastUpdated?: string;
	readonly nextAction?: string;
	readonly observations?: {
		readonly selectedTask?: string;
	};
}

interface IJsonProposalEntry {
	readonly id?: string;
	readonly status?: string;
}

interface IJsonProposalIndex {
	readonly proposals?: readonly IJsonProposalEntry[];
}

interface IJsonLockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly ownership?: readonly string[];
	readonly last_seen?: string;
	readonly parent_task_id?: string;
}

interface IJsonLockFile {
	readonly in_flight?: readonly IJsonLockEntry[];
}

interface IJsonRegistry {
	readonly assignments?: readonly IAgentAssignment[];
}

interface IJsonSourceRead<T> {
	readonly state: IRoundContextSourceState;
	readonly fingerprint: string;
	readonly timestamp: string | null;
	readonly ageMinutes: number | null;
	readonly temporallyStale: boolean;
	readonly value: T | null;
}

export interface IRoundContextOperationalSnapshot {
	readonly sources: IRoundContextSources;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly proposalPortfolio: IRoundContextProposalPortfolio;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
}

const readJsonSource = <T>(
	path: string,
	timestampSelector?: (value: T) => string | null,
	staleAfterMinutes?: number
): IJsonSourceRead<T> => {
	if (!existsSync(path)) {
		return {
			state: 'missing',
			fingerprint: 'rh-missing',
			timestamp: null,
			ageMinutes: null,
			temporallyStale: false,
			value: null,
		};
	}
	const raw = readFileSync(path, 'utf8');
	const fingerprint = computeFingerprint(raw);
	try {
		const value = JSON.parse(raw) as T;
		const timestamp = timestampSelector?.(value) ?? null;
		const ageMinutes = computeAgeMinutes(timestamp);
		const temporallyStale =
			ageMinutes !== null && staleAfterMinutes !== undefined
				? ageMinutes >= staleAfterMinutes
				: false;
		return {
			state: 'ok',
			fingerprint,
			timestamp,
			ageMinutes,
			temporallyStale,
			value,
		};
	} catch {
		return {
			state: 'corrupt',
			fingerprint,
			timestamp: null,
			ageMinutes: null,
			temporallyStale: false,
			value: null,
		};
	}
};

const extractProposalTimestamp = (value: IJsonProposalIndex): string | null => {
	const record = value as Record<string, unknown>;
	const generatedAt = record.generated_at;
	return typeof generatedAt === 'string' ? generatedAt : null;
};

interface IScannedProposalEntry {
	readonly id: string;
	readonly status: string;
}

const scanLiveProposalEntries = (
	monorepoRoot: string,
	layout: IHostPathLayout = DEFAULT_PATH_LAYOUT,
	// Host folder policy (e.g. `paused/demos`) is injected, not baked in:
	// paths relative to `proposalsDir`. mcp-core stays agnostic. [M5]
	extraFolders: readonly string[] = []
): IScannedProposalEntry[] => {
	const proposalsDir = join(monorepoRoot, layout.proposalsDir);
	const roots = [
		proposalsDir,
		...extraFolders.map((folder) => join(proposalsDir, folder)),
	];
	const entries: IScannedProposalEntry[] = [];
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const name of readdirSync(root)) {
			if (!name.endsWith('.md') || name === 'README.md') continue;
			const abs = join(root, name);
			const raw = readFileSync(abs, 'utf8');
			const block = extractYamlBlock(raw);
			const parsed = block ? parseFrontmatterBlock(block) : {};
			const parsedRecord = parsed as Record<string, IYamlValue>;
			const idValue = parsedRecord.id;
			const statusValue = parsedRecord.status;
			const id =
				typeof idValue === 'string'
					? idValue
					: name.replace(/\.md$/, '');
			const status =
				typeof statusValue === 'string' ? statusValue : 'pending';
			entries.push({ id, status });
		}
	}
	return entries;
};

export const readChatContextSummary = (
	monorepoRoot: string
): IRoundContextChatContext =>
	collectRoundContextSnapshot(monorepoRoot).chatContext;

export const readCheckpointSummary = (
	monorepoRoot: string
): IRoundContextCheckpoint =>
	collectRoundContextSnapshot(monorepoRoot).checkpoint;

export const readProposalPortfolioSummary = (
	monorepoRoot: string
): IRoundContextProposalPortfolio =>
	collectRoundContextSnapshot(monorepoRoot).proposalPortfolio;

export const readLockSummary = (
	monorepoRoot: string
): {
	readonly source: IRoundContextSourceMeta;
	readonly locks: readonly IRoundContextLock[];
} => {
	const snapshot = collectRoundContextSnapshot(monorepoRoot);
	return {
		source: snapshot.sources.lock,
		locks: snapshot.activeLocks,
	};
};

export const readAgentSummary = (
	monorepoRoot: string
): {
	readonly source: IRoundContextSourceMeta;
	readonly agents: readonly IRoundContextAgent[];
} => {
	const snapshot = collectRoundContextSnapshot(monorepoRoot);
	return {
		source: snapshot.sources.registry,
		agents: snapshot.activeAgents,
	};
};

export const buildOperationalSources = (
	monorepoRoot: string,
	layout: IHostPathLayout = DEFAULT_PATH_LAYOUT
): IRoundContextSources => {
	const chat = readJsonSource<IJsonChatContext>(
		join(monorepoRoot, layout.orchestratorChatContextFile)
	);
	const checkpoint = readJsonSource<IJsonCheckpoint>(
		join(monorepoRoot, layout.orchestratorCheckpointFile)
	);
	const lock = readJsonSource<IJsonLockFile>(
		join(monorepoRoot, layout.lockFile)
	);
	const registry = readJsonSource<IJsonRegistry>(
		join(monorepoRoot, layout.agentRegistryFile)
	);
	return {
		chatContext: {
			state: chat.state,
			fingerprint: chat.fingerprint,
			timestamp: chat.timestamp,
			ageMinutes: chat.ageMinutes,
			temporallyStale: chat.temporallyStale,
		},
		checkpoint: {
			state: checkpoint.state,
			fingerprint: checkpoint.fingerprint,
			timestamp: checkpoint.timestamp,
			ageMinutes: checkpoint.ageMinutes,
			temporallyStale: checkpoint.temporallyStale,
		},
		lock: {
			state: lock.state,
			fingerprint: lock.fingerprint,
			timestamp: lock.timestamp,
			ageMinutes: lock.ageMinutes,
			temporallyStale: lock.temporallyStale,
		},
		registry: {
			state: registry.state,
			fingerprint: registry.fingerprint,
			timestamp: registry.timestamp,
			ageMinutes: registry.ageMinutes,
			temporallyStale: registry.temporallyStale,
		},
	};
};

export const collectRoundContextSnapshot = (
	monorepoRoot: string,
	layout: IHostPathLayout = DEFAULT_PATH_LAYOUT,
	// Extra host proposal folders (relative to proposalsDir) scanned when
	// no index.json is present. Injected by the plugin from ctx.options. [M5]
	extraFolders: readonly string[] = []
): IRoundContextOperationalSnapshot => {
	const chat = readJsonSource<IJsonChatContext>(
		join(monorepoRoot, layout.orchestratorChatContextFile),
		(value) => value.lastUpdated ?? null,
		CONTINUITY_STALE_WINDOW_MS / 60_000
	);
	const checkpoint = readJsonSource<IJsonCheckpoint>(
		join(monorepoRoot, layout.orchestratorCheckpointFile),
		(value) => value.updatedAt ?? value.lastUpdated ?? null,
		CONTINUITY_STALE_WINDOW_MS / 60_000
	);
	const lock = readJsonSource<IJsonLockFile>(
		join(monorepoRoot, layout.lockFile)
	);
	const registry = readJsonSource<IJsonRegistry>(
		join(monorepoRoot, layout.agentRegistryFile)
	);
	const proposalIndex = readJsonSource<IJsonProposalIndex>(
		join(monorepoRoot, layout.proposalIndexFile),
		extractProposalTimestamp,
		CONTINUITY_STALE_WINDOW_MS / 60_000
	);
	const activeLocks = (lock.value?.in_flight ?? []).map((entry) => ({
		taskId: entry.task_id ?? 'unknown',
		agent: entry.agent ?? 'unknown',
		ownershipCount: entry.ownership?.length ?? 0,
		filesPreview: (entry.ownership ?? []).slice(0, 5),
		lastSeen: entry.last_seen ?? 'unknown',
		...(entry.parent_task_id !== undefined
			? { parentTaskId: entry.parent_task_id }
			: {}),
	}));
	const activeAgents = (registry.value?.assignments ?? [])
		.filter((assignment) => assignment.status === 'active')
		.map((assignment) => ({
			agent: assignment.agent_name,
			taskId: assignment.task_id,
			slot: assignment.agent_slot,
			depth: assignment.depth,
			lastSeen: assignment.last_seen,
			adopted: assignment.adopted,
		}));
	const activePortfolioSource =
		proposalIndex.state === 'ok' && proposalIndex.value !== null
			? (proposalIndex.value.proposals ?? [])
			: scanLiveProposalEntries(monorepoRoot, layout, extraFolders);
	const activePortfolio = activePortfolioSource.filter((entry) => {
		const status = entry.status;
		return status !== 'done' && status !== 'retired' && status !== 'paused';
	});
	const activeIds = activePortfolio
		.map((entry) => entry.id)
		.filter((value): value is string => typeof value === 'string');
	const latestLockSeen = activeLocks.reduce<string | null>(
		(latest, item) =>
			latest === null || item.lastSeen > latest ? item.lastSeen : latest,
		null
	);
	const latestAgentSeen = activeAgents.reduce<string | null>(
		(latest, item) =>
			latest === null || item.lastSeen > latest ? item.lastSeen : latest,
		null
	);
	return {
		sources: {
			chatContext: {
				state: chat.state,
				fingerprint: chat.fingerprint,
				timestamp: chat.timestamp,
				ageMinutes: chat.ageMinutes,
				temporallyStale: chat.temporallyStale,
			},
			checkpoint: {
				state: checkpoint.state,
				fingerprint: checkpoint.fingerprint,
				timestamp: checkpoint.timestamp,
				ageMinutes: checkpoint.ageMinutes,
				temporallyStale: checkpoint.temporallyStale,
			},
			lock: {
				state: lock.state,
				fingerprint: lock.fingerprint,
				timestamp: latestLockSeen,
				ageMinutes:
					activeLocks.length > 0
						? Math.max(
								...activeLocks.map(
									(item) =>
										computeAgeMinutes(item.lastSeen) ?? 0
								)
							)
						: null,
				temporallyStale: activeLocks.some((item) => {
					const age = computeAgeMinutes(item.lastSeen);
					return age !== null && age >= 10;
				}),
			},
			registry: {
				state: registry.state,
				fingerprint: registry.fingerprint,
				timestamp: latestAgentSeen,
				ageMinutes:
					activeAgents.length > 0
						? Math.max(
								...activeAgents.map(
									(item) =>
										computeAgeMinutes(item.lastSeen) ?? 0
								)
							)
						: null,
				temporallyStale: activeAgents.some((item) => {
					const age = computeAgeMinutes(item.lastSeen);
					return (
						age !== null &&
						age >= AGENT_CONVENTIONS.heartbeat_ttl_minutes
					);
				}),
			},
		},
		chatContext: {
			proposalIds: chat.value?.proposalIds ?? [],
			...(chat.value?.topic !== undefined
				? { topic: chat.value.topic }
				: {}),
			...(chat.value?.lastUpdated !== undefined
				? { lastUpdated: chat.value.lastUpdated }
				: {}),
		},
		checkpoint: {
			...(checkpoint.value?.proposalId !== undefined
				? { proposalId: checkpoint.value.proposalId }
				: {}),
			...(checkpoint.value?.status !== undefined
				? { status: checkpoint.value.status }
				: {}),
			...(checkpoint.value?.observations?.selectedTask !== undefined
				? { selectedTask: checkpoint.value.observations.selectedTask }
				: {}),
			...(checkpoint.value?.nextAction !== undefined
				? { nextAction: checkpoint.value.nextAction }
				: {}),
			...(checkpoint.value?.updatedAt !== undefined ||
			checkpoint.value?.lastUpdated !== undefined
				? {
						updatedAt:
							checkpoint.value?.updatedAt ??
							checkpoint.value?.lastUpdated,
					}
				: {}),
		},
		proposalPortfolio: {
			sourceState: proposalIndex.state,
			strategy:
				proposalIndex.state === 'ok' && proposalIndex.value !== null
					? 'index'
					: 'fallback-scan',
			activeIds: activeIds.slice(0, ACTIVE_PROPOSAL_PREVIEW_LIMIT),
			activeOverflowCount: Math.max(
				activeIds.length - ACTIVE_PROPOSAL_PREVIEW_LIMIT,
				0
			),
			activeCount: activeIds.length,
			pendingCount: activePortfolio.filter(
				(entry) => entry.status === 'pending'
			).length,
			inProgressCount: activePortfolio.filter(
				(entry) => entry.status === 'in_progress'
			).length,
		},
		activeLocks,
		activeAgents,
	};
};
