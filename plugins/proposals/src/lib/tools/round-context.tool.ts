import { z } from 'zod';

import { toolJson } from '@mcp-vertex/core/public';
import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildResumeHint,
	buildRoundContextDigest,
	buildRoundId,
	collectRoundContextSnapshot,
	computeCoreDocHashes,
	isDigestStale,
	readRoundContextDigest,
	writeRoundContextDigest,
} from '../swarm/round-context';
import type { IRoundContextDigest } from '../swarm/round-context';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';

export interface IRoundContextToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root the snapshot/hashes are computed against. */
	readonly workspaceRoot: string;
	/** Absolute path of the persisted round-context digest. */
	readonly digestPathAbs: string;
	/** Workspace-relative docs whose hashes detect staleness. */
	readonly coreDocs: readonly string[];
	/**
	 * Workspace-relative path layout for the sidecar files the snapshot
	 * reads (lock, checkpoint, chat-context, registry, proposal index).
	 * Defaults to `DEFAULT_PATH_LAYOUT` inside the engine when omitted.
	 */
	readonly layout?: IHostPathLayout;
	/**
	 * Host-specific proposal subfolders (relative to proposalsDir) scanned
	 * when no index.json exists, e.g. `['paused/demos']`.
	 */
	readonly extraFolders?: readonly string[];
}

export interface IRoundContextOutput {
	readonly digest: IRoundContextDigest | null;
	readonly stale: boolean;
	readonly recomputedAt: string;
	readonly digestPath: string;
}

const SOURCE_STATE_SCHEMA = z.enum(['ok', 'missing', 'corrupt']);

const ROUND_CONTEXT_SOURCE_META_SCHEMA = z.object({
	state: SOURCE_STATE_SCHEMA,
	fingerprint: z.string(),
	timestamp: z.string().nullable(),
	ageMinutes: z.number().nullable(),
	temporallyStale: z.boolean(),
});

const ROUND_CONTEXT_SOURCES_SCHEMA = z.object({
	chatContext: ROUND_CONTEXT_SOURCE_META_SCHEMA,
	checkpoint: ROUND_CONTEXT_SOURCE_META_SCHEMA,
	lock: ROUND_CONTEXT_SOURCE_META_SCHEMA,
	registry: ROUND_CONTEXT_SOURCE_META_SCHEMA,
});

const ROUND_CONTEXT_LOCK_SCHEMA = z.object({
	taskId: z.string(),
	agent: z.string(),
	ownershipCount: z.number(),
	filesPreview: z.array(z.string()),
	lastSeen: z.string(),
	parentTaskId: z.string().optional(),
});

const ROUND_CONTEXT_AGENT_SCHEMA = z.object({
	agent: z.string(),
	taskId: z.string(),
	slot: z.string(),
	depth: z.number(),
	lastSeen: z.string(),
	adopted: z.boolean(),
});

const ROUND_CONTEXT_CHAT_CONTEXT_SCHEMA = z.object({
	proposalIds: z.array(z.string()),
	topic: z.string().optional(),
	lastUpdated: z.string().optional(),
});

const ROUND_CONTEXT_CHECKPOINT_SCHEMA = z.object({
	proposalId: z.string().optional(),
	status: z.string().optional(),
	selectedTask: z.string().optional(),
	nextAction: z.string().optional(),
	updatedAt: z.string().optional(),
});

const ROUND_CONTEXT_PORTFOLIO_SCHEMA = z.object({
	sourceState: SOURCE_STATE_SCHEMA,
	strategy: z.enum(['index', 'fallback-scan']),
	activeIds: z.array(z.string()),
	activeOverflowCount: z.number(),
	activeCount: z.number(),
	pendingCount: z.number(),
	inProgressCount: z.number(),
});

const ROUND_CONTEXT_RESUME_HINT_SCHEMA = z.object({
	mode: z.enum(['resume', 'next', 'unknown']),
	proposalId: z.string(),
	reason: z.string(),
	taskId: z.string().optional(),
});

const ROUND_CONTEXT_DIGEST_SCHEMA = z.object({
	roundId: z.string(),
	activeProposalId: z.string(),
	currentTaskId: z.string(),
	activeLocks: z.array(ROUND_CONTEXT_LOCK_SCHEMA),
	activeAgents: z.array(ROUND_CONTEXT_AGENT_SCHEMA),
	coreDocHashes: z.record(z.string(), z.string()),
	sources: ROUND_CONTEXT_SOURCES_SCHEMA,
	chatContext: ROUND_CONTEXT_CHAT_CONTEXT_SCHEMA,
	checkpoint: ROUND_CONTEXT_CHECKPOINT_SCHEMA,
	proposalPortfolio: ROUND_CONTEXT_PORTFOLIO_SCHEMA,
	resumeHint: ROUND_CONTEXT_RESUME_HINT_SCHEMA,
	createdAt: z.string(),
	digestVersion: z.literal(1),
});

const ROUND_CONTEXT_OUTPUT_SCHEMA = z.object({
	digest: ROUND_CONTEXT_DIGEST_SCHEMA.nullable(),
	stale: z.boolean(),
	recomputedAt: z.string(),
	digestPath: z.string(),
});

const firstToken = (value: string): string =>
	value.split(/[^a-zA-Z0-9]/)[0] ?? 'unknown';

/**
 * Build the round-context view: return the persisted multi-agent round
 * digest and whether it is stale, or (with forceRefresh) recompute and
 * persist a fresh one. Pure over the injected paths; thin adapter over
 * the (tested) round-context engine.
 */
export const buildRoundContextOutput = async (
	input: { forceRefresh?: boolean | undefined },
	options: IRoundContextToolOptions,
): Promise<IRoundContextOutput> => {
	const recomputedAt = new Date().toISOString();
	const digestPath = options.digestPathAbs;
	const [liveHashes, liveSnapshot] = await Promise.all([
		computeCoreDocHashes(options.workspaceRoot, [...options.coreDocs]),
		collectRoundContextSnapshot(
			options.workspaceRoot,
			options.layout,
			options.extraFolders ?? [],
		),
	]);

	if (input.forceRefresh === true) {
		const {
			checkpoint,
			chatContext,
			proposalPortfolio,
			activeLocks,
			activeAgents,
		} = liveSnapshot;
		const fallbackTaskId =
			activeLocks[0]?.taskId ?? activeAgents[0]?.taskId ?? 'unknown';
		const activeProposalId =
			checkpoint.proposalId ??
			chatContext.proposalIds[0] ??
			firstToken(fallbackTaskId);
		const currentTaskId =
			checkpoint.selectedTask ?? checkpoint.nextAction ?? fallbackTaskId;
		const resumeHint = buildResumeHint({
			activeProposalId,
			currentTaskId,
			chatContext,
			checkpoint,
			activeLocks,
			activeAgents,
		});
		const seedDigest = buildRoundContextDigest({
			roundId: 'pending-round-id',
			activeProposalId,
			currentTaskId,
			activeLocks,
			activeAgents,
			coreDocHashes: liveHashes,
			sources: liveSnapshot.sources,
			chatContext,
			checkpoint,
			proposalPortfolio,
			resumeHint,
		});
		const freshDigest: IRoundContextDigest = {
			...seedDigest,
			roundId: buildRoundId(seedDigest),
			createdAt: recomputedAt,
		};
		await writeRoundContextDigest(freshDigest, digestPath);
		return { digest: freshDigest, stale: false, recomputedAt, digestPath };
	}

	const persisted = await readRoundContextDigest(digestPath);
	if (persisted === null) {
		return { digest: null, stale: false, recomputedAt, digestPath };
	}
	return {
		digest: persisted,
		stale: isDigestStale(persisted, liveHashes, liveSnapshot.sources),
		recomputedAt,
		digestPath,
	};
};

/**
 * Round digest tool: returns the persisted multi-agent round context
 * and whether it is stale. Use for resumed swarm work, not normal
 * single-slice execution.
 */
export const buildRoundContextRegistration = (
	options: IRoundContextToolOptions,
): IToolRegistration => ({
	id: 'round_context',
	effects: ['write'],
	summary:
		'Persisted multi-agent round digest + staleness (forceRefresh recomputes). For resumed swarm work.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_round_context`,
			{
				outputSchema: ROUND_CONTEXT_OUTPUT_SCHEMA,
				description:
					'Round digest only: return the persisted multi-agent round context and whether it is stale. forceRefresh recomputes and persists it. Use for resumed swarm work, not normal single-slice execution.',
				inputSchema: z.object({
					forceRefresh: z.boolean().optional(),
				}),
			},
			async (args: { forceRefresh?: boolean | undefined }) => {
				const out = await buildRoundContextOutput(args ?? {}, options);
				return toolJson(out as unknown as Record<string, unknown>);
			},
		);
	},
});
