/** Read-only host-adapter surface for rehydrating an explicit session digest. */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { CorruptFileError, toolError, toolJson } from '@mcp-vertex/core/public';
import type { IToolTextResult } from '@mcp-vertex/core/public';

import {
	buildCheckpointPacket,
	DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS,
} from '../services/checkpoint-packet';
import { selectLatestSessionDigest } from '../services/session-digest-recall';
import { readStore } from '../services/store';

const PacketSchema = z.object({
	digest: z.string(),
	pointers: z.array(z.string()),
	nextAction: z.string().nullable(),
});

export interface ICheckpointPacketToolOptions {
	readonly namespacePrefix: string;
	readonly storePathAbs: string;
}

const guardCorrupt = async (
	fn: () => Promise<IToolTextResult>,
): Promise<IToolTextResult> => {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof CorruptFileError) {
			return toolError(
				`memory store is corrupt: ${error.message}`,
				error.backupPath
					? `The corrupt file was preserved at "${error.backupPath}". Inspect or delete it, then retry.`
					: 'Could not back up the corrupt store; inspect it manually before retrying.',
			);
		}
		throw error;
	}
};

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
						.min(200)
						.max(8_000)
						.optional(),
				}),
				outputSchema: z.object({
					available: z.boolean(),
					packet: PacketSchema.nullable(),
				}),
			},
			async (args: { maxDigestChars?: number | undefined }) =>
				guardCorrupt(async () => {
					const notes = await readStore(options.storePathAbs);
					const digest = selectLatestSessionDigest(
						notes.map((note) => ({
							title: note.title,
							body: note.body,
							createdAt: note.createdAt,
						})),
					);
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
