/**
 * ack.tool.ts — `<prefix>_ack` (f00068 S3, gate decision 5).
 *
 * The human side of the activation gate: record an accept/reject for a
 * declared server, or list the activations still awaiting a decision.
 * The record is DURABLE (pending-acks ledger under the plugin cache
 * dir: mutex → redact → atomic write), so when
 * `requireHumanAckWhenLlmDecides` is true the S2 subprocess registry
 * can gate first activation on `isAcked(serverId)` across restarts.
 *
 * A rejection is recorded too — the server stays un-acked, but the "no"
 * survives, visible instead of silently re-askable. Every decision is
 * also emitted through the host notification bridge
 * (`sendLoggingMessage`, non-modal — decision 5) when a transport is
 * connected; the durable ledger stays the source of truth.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

import {
	createPendingAcksStore,
	listPending,
	type IPendingAck,
} from '../ack/pending-acks';

export interface IAckToolOptions {
	readonly namespacePrefix: string;
	/** ABSOLUTE ledger path (resolved from `ctx.pluginCacheDir`). */
	readonly pendingAcksPath: string;
}

const InputSchema = z.object({
	/** Declared server id the decision applies to. */
	server: z.string().optional(),
	/** true = accept the activation, false = reject it. */
	accept: z.boolean().optional(),
	/** List the activations still awaiting a decision. */
	list: z.boolean().optional(),
	/** Who decided (defaults to unattributed). */
	ackedBy: z.string().optional(),
});

const AckEntrySchema = z.object({
	serverId: z.string(),
	requestedAt: z.string(),
	reason: z.string().optional(),
	ackedAt: z.string().optional(),
	ackedBy: z.string().optional(),
	accepted: z.boolean().optional(),
});

// x00107: the outputSchema describes the SUCCESS shape only — the MCP
// SDK skips schema validation for `isError` results (`toolError`), so
// the strict `literal(true)` + required fields are correct and keep
// the generated SDK types strong. (x00105 briefly loosened this based
// on a probe that misread SDK semantics; reverted.)
export const AckOutputSchema = z.object({
	ok: z.literal(true),
	mode: z.enum(['list', 'record']),
	total: z.number().int().nonnegative(),
	pending: z.array(AckEntrySchema).optional(),
	ack: AckEntrySchema.optional(),
});

/** Plain-object projection of a ledger entry for the tool payload. */
const toAckPayload = (ack: IPendingAck): Record<string, unknown> => ({
	serverId: ack.serverId,
	requestedAt: ack.requestedAt,
	...(ack.reason !== undefined ? { reason: ack.reason } : {}),
	...(ack.ackedAt !== undefined ? { ackedAt: ack.ackedAt } : {}),
	...(ack.ackedBy !== undefined ? { ackedBy: ack.ackedBy } : {}),
	...(ack.accepted !== undefined ? { accepted: ack.accepted } : {}),
});

/**
 * Emit the decision through the standard host notification bridge
 * (`McpServer.sendLoggingMessage`, the same surface the notification
 * plugin's agent-events bridge uses). Best-effort: a missing method
 * (test double) or a disconnected transport never fails the ack — the
 * durable record is the contract.
 */
const emitAckNotification = async (
	server: McpServer,
	namespacePrefix: string,
	ack: IPendingAck,
): Promise<void> => {
	const sender = server as Partial<Pick<McpServer, 'sendLoggingMessage'>>;
	if (typeof sender.sendLoggingMessage !== 'function') return;
	try {
		await sender.sendLoggingMessage({
			level: 'info',
			logger: `${namespacePrefix}_ack`,
			data: {
				event:
					ack.accepted === true
						? 'external-mcp-ack-accepted'
						: 'external-mcp-ack-rejected',
				...toAckPayload(ack),
			},
		});
	} catch {
		// No transport connected — the durable ledger already recorded it.
	}
};

export const buildAckToolRegistration = (
	options: IAckToolOptions,
): IToolRegistration => ({
	id: 'ack',
	tags: ['external-mcps', 'lazy', 'coordination'],
	effects: ['write'],
	summary:
		'Record the human accept/reject for an external-server activation, or list pending acks.',
	descriptionKey: 'delendai_external-mcps_ack',
	register: async (server) => {
		const store = createPendingAcksStore(options.pendingAcksPath);
		server.registerTool(
			`${options.namespacePrefix}_ack`,
			{
				description:
					'Record a HUMAN decision on an external-server activation: `{server, accept}` persists the accept/reject durably in the plugin cache (redacted, atomic), `{list: true}` returns the activations still awaiting a decision. While `requireHumanAckWhenLlmDecides` is true (the default), a declared server boots only after an accepted ack is on record; a recorded rejection keeps it un-acked. Each decision is also surfaced as a non-modal host notification.',
				inputSchema: InputSchema,
				outputSchema: AckOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				if (args.list === true) {
					const pending = listPending(await store.read());
					return toolJson({
						ok: true,
						mode: 'list',
						total: pending.length,
						pending: pending.map(toAckPayload),
					});
				}
				const serverId = args.server?.trim() ?? '';
				if (serverId === '' || typeof args.accept !== 'boolean') {
					return toolError(
						'invalid-args: pass { server, accept } to record a decision, or { list: true } to view pending activations',
					);
				}
				const ack = await store.record(
					serverId,
					args.accept,
					args.ackedBy,
				);
				await emitAckNotification(server, options.namespacePrefix, ack);
				return toolJson({
					ok: true,
					mode: 'record',
					total: 1,
					ack: toAckPayload(ack),
				});
			},
		);
	},
});
