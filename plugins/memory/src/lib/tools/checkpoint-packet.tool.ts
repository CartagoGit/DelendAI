/** Read-only host-adapter surface for rehydrating an explicit session digest. */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	buildCheckpointPacket,
	DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS,
} from '../services/checkpoint-packet';
import {
	assessCheckpointFreshness,
	DEFAULT_CHECKPOINT_MAX_AGE_MS,
} from '../services/checkpoint-freshness';
import { selectLatestSessionDigest } from '../services/session-digest-recall';
import { readStore } from '../services/store';
import { guardCorruptStore } from './tool-guard-corrupt';

const _PacketSchema = z.object({
	digest: z.string(),
	pointers: z.array(z.string()),
	nextAction: z.string().nullable(),
});
const _AdvisorySchema = z.object({
	hostEvent: z.enum(['pre-compact', 'session-end']),
	freshness: z.object({
		state: z.enum(['missing', 'fresh', 'stale']),
		latestCheckpointAt: z.string().nullable(),
		ageMs: z.number().nullable(),
		maxAgeMs: z.number(),
	}),
	shouldCreateSemanticCheckpoint: z.boolean(),
	recommendedAction: z.enum([
		'create-semantic-checkpoint',
		'continue-with-current-checkpoint',
	]),
});

const MIN_PACKET_DIGEST_CHARS = 200;
const MAX_CHECKPOINT_AGE_MINUTES = 24 * 60;

export interface ICheckpointPacketToolOptions {
	readonly namespacePrefix: string;
	readonly storePathAbs: string;
}

/**
 * Return a portable continuation packet without reading host transcripts or
 * inferring a host lifecycle. Safe for manual resume and documented hooks.
 */
export const buildCheckpointPacketToolRegistration = (
	options: ICheckpointPacketToolOptions,
): IToolRegistration => ({
	id: 'checkpoint_packet',
	summary:
		'Rehydrate the latest explicit session digest as a bounded continuation packet.',
	descriptionKey: 'memory_checkpoint_packet',
	tags: ['memory', 'token-efficiency', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_checkpoint_packet`,
			{
				description:
					'Return the newest explicit session digest as a bounded, redacted continuation packet: digest, pointers and the next open action. Read-only; it never reads a host transcript, context meter or quota. Use after a host compaction or when resuming a task. First create or update the digest deliberately with memory_compact.',
				inputSchema: z.object({
					maxDigestChars: z
						.number()
						.int()
						.min(MIN_PACKET_DIGEST_CHARS)
						.max(8_000)
						.optional(),
					hostEvent: z
						.enum(['pre-compact', 'session-end'])
						.optional(),
					maxCheckpointAgeMinutes: z
						.number()
						.int()
						.positive()
						.max(MAX_CHECKPOINT_AGE_MINUTES)
						.optional(),
				}),
				outputSchema: z.object({
					available: z.boolean(),
					packet: z.unknown().nullable(),
					advisory: z.unknown().optional(),
				}),
			},
			async (args: {
				maxDigestChars?: number | undefined;
				hostEvent?: 'pre-compact' | 'session-end' | undefined;
				maxCheckpointAgeMinutes?: number | undefined;
			}) =>
				guardCorruptStore(async () => {
					const notes = await readStore(options.storePathAbs);
					const digest = selectLatestSessionDigest(
						notes.map((note) => ({
							title: note.title,
							body: note.body,
							createdAt: note.createdAt,
						})),
					);
					if (args.hostEvent !== undefined) {
						const freshness = assessCheckpointFreshness(
							digest,
							Date.now(),
							(args.maxCheckpointAgeMinutes ??
								DEFAULT_CHECKPOINT_MAX_AGE_MS / 60_000) *
								60_000,
						);
						const shouldCreateSemanticCheckpoint =
							freshness.state !== 'fresh';
						return toolJson({
							available: digest !== null,
							packet: null,
							advisory: {
								hostEvent: args.hostEvent,
								freshness,
								shouldCreateSemanticCheckpoint,
								recommendedAction:
									shouldCreateSemanticCheckpoint
										? 'create-semantic-checkpoint'
										: 'continue-with-current-checkpoint',
							},
						});
					}
					if (digest === null) {
						return toolJson({ available: false, packet: null });
					}
					return toolJson({
						available: true,
						packet: buildCheckpointPacket(
							digest,
							args.maxDigestChars ??
								DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS,
						),
					});
				}),
		);
	},
});
