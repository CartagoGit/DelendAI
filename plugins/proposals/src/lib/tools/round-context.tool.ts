import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';

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
	 * when no index.json exists, e.g. `['paused/demos']`. [M5]
	 */
	readonly extraFolders?: readonly string[];
}

export interface IRoundContextOutput {
	readonly digest: IRoundContextDigest | null;
	readonly stale: boolean;
	readonly recomputedAt: string;
	readonly digestPath: string;
}

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
	options: IRoundContextToolOptions
): Promise<IRoundContextOutput> => {
	const recomputedAt = new Date().toISOString();
	const digestPath = options.digestPathAbs;
	const liveHashes = computeCoreDocHashes(options.workspaceRoot, [
		...options.coreDocs,
	]);
	const liveSnapshot = collectRoundContextSnapshot(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? []
	);

	if (input.forceRefresh === true) {
		const { checkpoint, chatContext, proposalPortfolio, activeLocks, activeAgents } =
			liveSnapshot;
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
	options: IRoundContextToolOptions
): IToolRegistration => ({
	id: 'round_context',
	summary:
		'Persisted multi-agent round digest + staleness (forceRefresh recomputes). For resumed swarm work.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_round_context`,
			{
						outputSchema: z.record(z.string(), z.unknown()),
				description:
					'Round digest only: return the persisted multi-agent round context and whether it is stale. forceRefresh recomputes and persists it. Use for resumed swarm work, not normal single-slice execution.',
				inputSchema: z.object({
					forceRefresh: z.boolean().optional(),
				}),
			},
			async (args: { forceRefresh?: boolean | undefined }) => ({
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							await buildRoundContextOutput(args ?? {}, options),
							null,
							'\t'
						),
					},
				],
			})
		);
	},
});
