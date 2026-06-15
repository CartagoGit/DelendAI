/**
 * round-context.ts
 *
 * IRoundContextDigest + helpers for the Agent Swarm Governor.
 *
 * The round-context digest is a small JSON document published at
 * `.cache/round-context.digest.json` that captures a stable view of the
 * current round (active proposal, current task, active locks, active
 * subagents, and hashes of the 4 core docs). Any subagent that needs to
 * read those core docs MUST consult the digest first; if its hashes
 * match the current core-doc hashes of the on-disk files, the
 * cached view is still valid and the read can be skipped.
 *
 * This module is filesystem-aware (atomic .tmp + rename for the digest,
 * SHA-256 truncated to 8 bytes for the core docs) and contains no MCP
 * server wiring — that lives in `the round-context tool`.
 *
 * Hashing choice: we use `node:crypto.createHash('sha256')` truncated
 * to the first 8 bytes (16 hex chars) and prefixed with `rh-`. The
 * 8-byte truncation keeps the digest compact; SHA-256 guarantees
 * collision resistance within the workspace. The `node:crypto` API
 * is implemented by both Bun and Node, so the helper works under
 * Vitest (Node) and the production MCP server (Bun) without
 * branching on the runtime.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolveWorkspacePath } from '../shared/resolve-workspace-path';
import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import { CLOSED_CHECKPOINT_STATUSES } from './runtime-recovery';
import type { IAgentAssignment } from '../shared/agent-registry-store';
import { CONTINUITY_STALE_WINDOW_MS } from './runtime-recovery';
import { AGENT_CONVENTIONS } from '../shared/agent-conventions';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import type { IYamlValue } from '../proposals/frontmatter-parser';

// ---------------------------------------------------------------------------
// Core docs (the canonical "core four" the proposal names)
// ---------------------------------------------------------------------------

/**
 * The four core documents whose stable hashes anchor the round context.
 *
 * - `README.md` — top-level workspace README.
 * - `docs/proposals/index.json` — proposal registry.
 * - `.github/copilot-instructions.md` — root Copilot instructions.
 * - `the proposal-workflow knowledge` — the
 *   proposal workflow skill (the doc subagents consult to understand
 *   proposal governance).
 */
// the default doc set is HOST-AGNOSTIC (workspace README +
// proposal index). Hosts inject their full list (instructions files,
// skill docs…) through the `coreDocs` parameter of
// `computeCoreDocHashes`.
export const CORE_DOCS = ['README.md', 'docs/proposals/index.json'] as const;

export type ICoreDocRelPath = string;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IRoundContextLock {
	readonly taskId: string;
	readonly agent: string;
	readonly ownershipCount: number;
	readonly filesPreview: readonly string[];
	readonly lastSeen: string;
	readonly parentTaskId?: string;
}

export interface IRoundContextAgent {
	readonly agent: string;
	readonly taskId: string;
	readonly slot: string;
	readonly depth: number;
	readonly lastSeen: string;
	readonly adopted: boolean;
}

export type IRoundContextSourceState = 'ok' | 'missing' | 'corrupt';

export interface IRoundContextSourceMeta {
	readonly state: IRoundContextSourceState;
	readonly fingerprint: string;
	readonly timestamp: string | null;
	readonly ageMinutes: number | null;
	readonly temporallyStale: boolean;
}

export interface IRoundContextSources {
	readonly chatContext: IRoundContextSourceMeta;
	readonly checkpoint: IRoundContextSourceMeta;
	readonly lock: IRoundContextSourceMeta;
	readonly registry: IRoundContextSourceMeta;
}

export interface IRoundContextChatContext {
	readonly proposalIds: readonly string[];
	readonly topic?: string;
	readonly lastUpdated?: string;
}

export interface IRoundContextCheckpoint {
	readonly proposalId?: string;
	readonly status?: string;
	readonly selectedTask?: string;
	readonly nextAction?: string;
	readonly updatedAt?: string;
}

export interface IRoundContextProposalPortfolio {
	readonly sourceState: IRoundContextSourceState;
	readonly strategy: 'index' | 'fallback-scan';
	readonly activeIds: readonly string[];
	readonly activeOverflowCount: number;
	readonly activeCount: number;
	readonly pendingCount: number;
	readonly inProgressCount: number;
}

export interface IRoundContextResumeHint {
	readonly mode: 'resume' | 'next' | 'unknown';
	readonly proposalId: string;
	readonly reason: string;
	readonly taskId?: string;
}

export interface IRoundContextDigest {
	readonly roundId: string;
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly proposalPortfolio: IRoundContextProposalPortfolio;
	readonly resumeHint: IRoundContextResumeHint;
	readonly createdAt: string;
	readonly digestVersion: 1;
}

export interface IRoundContextDigestInput {
	readonly roundId: string;
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly proposalPortfolio: IRoundContextProposalPortfolio;
	readonly resumeHint: IRoundContextResumeHint;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * The default path where the round-context digest is published.
 *
 * Resolved at call time against the current workspace so the helper
 * works regardless of which package directory the process was launched
 * from.
 */
export const DEFAULT_ROUND_CONTEXT_PATH =
	DEFAULT_PATH_LAYOUT.roundContextDigestFile;

export const ROUND_CONTEXT_DIGEST_VERSION = 1 as const;
export const ACTIVE_PROPOSAL_PREVIEW_LIMIT = 5;

// ---------------------------------------------------------------------------
// 1. buildRoundContextDigest
// ---------------------------------------------------------------------------

/**
 * Build a well-formed `IRoundContextDigest` from its input parts.
 *
 * Stamps `createdAt` with the current UTC ISO 8601 timestamp and pins
 * `digestVersion` to `1`. The function is pure (no side effects, no
 * filesystem access).
 */
export const buildRoundContextDigest = (
	input: IRoundContextDigestInput
): IRoundContextDigest => ({
	roundId: input.roundId,
	activeProposalId: input.activeProposalId,
	currentTaskId: input.currentTaskId,
	activeLocks: input.activeLocks,
	activeAgents: input.activeAgents,
	coreDocHashes: input.coreDocHashes,
	sources: input.sources,
	chatContext: input.chatContext,
	checkpoint: input.checkpoint,
	proposalPortfolio: input.proposalPortfolio,
	resumeHint: input.resumeHint,
	createdAt: new Date().toISOString(),
	digestVersion: ROUND_CONTEXT_DIGEST_VERSION,
});

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

const computeFingerprint = (text: string): string => {
	const full = createHash('sha256').update(text).digest('hex');
	return formatRapidHash(full.slice(0, 16));
};

const computeAgeMinutes = (timestamp: string | null): number | null => {
	if (timestamp === null) return null;
	const parsed = Date.parse(timestamp);
	if (Number.isNaN(parsed)) return null;
	return Math.floor((Date.now() - parsed) / 60_000);
};

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
	const generatedAt = record['generated_at'];
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
			const idValue = parsedRecord['id'];
			const statusValue = parsedRecord['status'];
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

export const buildRoundId = (input: {
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
}): string => {
	const raw = JSON.stringify({
		proposal: input.activeProposalId,
		task: input.currentTaskId,
		core: input.coreDocHashes,
		sources: input.sources,
		locks: input.activeLocks.map((lock) => lock.taskId),
		agents: input.activeAgents.map((agent) => agent.taskId),
	});
	return `round-${computeFingerprint(raw)}`;
};

export const buildResumeHint = (input: {
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
}): IRoundContextResumeHint => {
	const inferredTaskId =
		input.currentTaskId !== 'unknown'
			? input.currentTaskId
			: (input.activeLocks[0]?.taskId ??
				input.activeAgents[0]?.taskId);
	const inferredProposalIdFromTask =
		inferredTaskId?.match(/^([pga]\d+[a-z]?)/)?.[1];
	const proposalId =
		input.checkpoint.proposalId ??
		input.chatContext.proposalIds[0] ??
		inferredProposalIdFromTask ??
		input.activeProposalId;
	const checkpointStatus = input.checkpoint.status?.trim().toLowerCase();
	if (
		checkpointStatus !== undefined &&
		checkpointStatus.length > 0 &&
		!CLOSED_CHECKPOINT_STATUSES.has(checkpointStatus)
	) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Checkpoint abierto: continuar el slice actual.',
			...(input.checkpoint.selectedTask !== undefined
				? { taskId: input.checkpoint.selectedTask }
				: inferredTaskId !== undefined
					? { taskId: inferredTaskId }
					: {}),
		};
	}
	if (
		checkpointStatus !== undefined &&
		CLOSED_CHECKPOINT_STATUSES.has(checkpointStatus)
	) {
		return {
			mode: 'next',
			proposalId,
			reason: 'Checkpoint cerrado: avanzar al siguiente slice compatible.',
			...(input.checkpoint.selectedTask !== undefined
				? { taskId: input.checkpoint.selectedTask }
				: input.currentTaskId !== 'unknown'
					? { taskId: input.currentTaskId }
					: {}),
		};
	}
	if (input.chatContext.proposalIds.length > 0) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Chat context activo: retomar la proposal prioritaria.',
			...(inferredTaskId !== undefined ? { taskId: inferredTaskId } : {}),
		};
	}
	if (inferredTaskId !== undefined) {
		return {
			mode: 'resume',
			proposalId,
			reason: 'Lock o subagente activo: retomar el slice en vuelo.',
			taskId: inferredTaskId,
		};
	}
	return {
		mode: 'unknown',
		proposalId,
		reason: 'Sin señal suficiente para decidir resume o next.',
		...(inferredTaskId !== undefined ? { taskId: inferredTaskId } : {}),
	};
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

// ---------------------------------------------------------------------------
// 2. isDigestStale
// ---------------------------------------------------------------------------

/**
 * Compare the digest's recorded `coreDocHashes` against `currentHashes`
 * (typically the live hashes returned by `computeCoreDocHashes`).
 *
 * Returns `true` if any recorded key is missing from the current map or
 * any value differs. Returns `false` only when every recorded key is
 * present and identical.
 */
export const isDigestStale = (
	digest: IRoundContextDigest,
	currentHashes: Readonly<Record<string, string>>,
	currentSources: IRoundContextSources = digest.sources
): boolean => {
	for (const [key, recorded] of Object.entries(digest.coreDocHashes)) {
		const live = currentHashes[key];
		if (live !== recorded) return true;
	}
	for (const [key, recorded] of Object.entries(digest.sources)) {
		const live = currentSources[key as keyof IRoundContextSources];
		if (
			live === undefined ||
			live.state !== recorded.state ||
			live.fingerprint !== recorded.fingerprint ||
			live.temporallyStale
		) {
			return true;
		}
	}
	return false;
};

// ---------------------------------------------------------------------------
// 3 & 5 & 6. computeCoreDocHashes + readRoundContextDigest + writeRoundContextDigest
// ---------------------------------------------------------------------------

/**
 * Format a 64-bit (8-byte) hash digest as a 16-char zero-padded hex
 * string with the `rh-` prefix. The prefix preserves the previous
 * `Bun.hash.rapidhash`-shaped output so any digest persisted before
 * the algorithm change is still recognisable, even though the value
 * itself will differ.
 */
const formatRapidHash = (hexBytes: string): string => `rh-${hexBytes}`;

/**
 * Compute the live `rh-<hex>` hashes for the 4 core docs at
 * `monorepoRoot`. Files that do not exist are recorded as the literal
 * string `'rh-missing'`. This keeps the digest schema stable even when
 * the workspace is partially provisioned.
 *
 * Algorithm: SHA-256 of the file content, truncated to the first 8
 * bytes (16 hex chars). Implemented via `node:crypto` so the helper
 * runs identically in Bun (production) and Node (Vitest). The output
 * is NOT byte-compatible with the previous `Bun.hash.rapidhash`-based
 * implementation; any pre-existing digest on disk will report stale
 * on its first recompute. That is acceptable: digests are advisory
 * caches, not authoritative state.
 */
export const computeCoreDocHashes = (
	monorepoRoot: string,
	// the doc list is host policy; the default keeps the
	// historical the host project set for compatibility, hosts may inject
	// their own (e.g. extra skill docs).
	coreDocs: readonly string[] = CORE_DOCS
): Record<string, string> => {
	const result: Record<string, string> = {};
	for (const rel of coreDocs) {
		const abs = join(monorepoRoot, rel);
		if (!existsSync(abs)) {
			result[rel] = 'rh-missing';
			continue;
		}
		const content = readFileSync(abs, 'utf8');
		// SHA-256 -> take the first 8 bytes (16 hex chars) -> prefix
		// with `rh-` to keep the previous wire format.
		const full = createHash('sha256').update(content).digest('hex');
		result[rel] = formatRapidHash(full.slice(0, 16));
	}
	return result;
};

/**
 * Resolve the default digest path against the current workspace.
 *
 * Public so the tool layer can call it for logging; the internal
 * `writeRoundContextDigest` / `readRoundContextDigest` accept any path.
 */
export const resolveDefaultDigestPath = (): string =>
	resolveWorkspacePath(DEFAULT_ROUND_CONTEXT_PATH);

/**
 * Read a digest from disk.
 *
 * Returns `null` (not an error) when the file does not exist. Throws if
 * the file exists but is malformed or fails a `JSON.parse` — that is a
 * real corruption signal the caller should surface.
 */
export const readRoundContextDigest = async (
	path: string
): Promise<IRoundContextDigest | null> => {
	if (!existsSync(path)) return null;
	const raw = readFileSync(path, 'utf8');
	return JSON.parse(raw) as IRoundContextDigest;
};

/**
 * Write a digest to disk atomically.
 *
 * Strategy:
 *   1. Ensure the parent directory exists.
 *   2. Write the JSON to `<path>.tmp` synchronously.
 *   3. Rename the `.tmp` over the final path (single syscall, atomic
 *      on POSIX).
 *   4. Clean up the `.tmp` if rename fails for any reason.
 *
 * `Bun.write` is used for the tmp step because it is the project's
 * canonical write path; `node:fs/promises#rename` is used for the
 * atomic move because Bun has no first-class `mv` helper.
 */
export const writeRoundContextDigest = async (
	digest: IRoundContextDigest,
	path: string
): Promise<void> => {
	const tmpPath = `${path}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	writeFileSync(tmpPath, JSON.stringify(digest, null, 2), 'utf8');
	try {
		await rename(tmpPath, path);
	} catch (err) {
		// Best-effort cleanup of the tmp sidecar so we never leak
		// half-written digests into the workspace.
		try {
			await rm(tmpPath, { force: true });
		} catch {
			// ignore
		}
		throw err;
	}
};
