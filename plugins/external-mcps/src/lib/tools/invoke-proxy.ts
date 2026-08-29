/**
 * invoke-proxy.ts — `<prefix>_call`, the invocation surface for
 * `ext.<server>.<tool>` (f00068 S2).
 *
 * The MCP host cannot dynamically register a child server's tools on its
 * own surface yet, so this proxy IS how an external tool gets invoked:
 * it routes `{server, tool, args}` through the registry (lazy boot on
 * first use, cached child after), forwards a JSON-RPC `tools/call`, and
 * returns the child's result. Every failure — unknown server, dead
 * child, timeout, missing human ack — is a structured `{ok:false, code,
 * hint}` payload, never a protocol crash.
 *
 * Ack gate (gate decision 5, resolved defaults): when
 * `requireHumanAckWhenLlmDecides` is true and no ack is recorded for the
 * server, the call is refused with `code: 'ack-required'`. The recorded-ack
 * check is an injectable (possibly async) predicate; the plugin manifest
 * composes it from the SAME durable pending-acks ledger the `ack` tool
 * writes (x00097 S1), so an accepted ack enables the call across restarts.
 *
 * Activation gate (AUD-D04): the two autonomy knobs plus the target
 * server's current running state are handed to the pure
 * {@link decideActivation} policy, not decided inline here. A server that
 * is already running serves the call regardless of the knobs (it is not
 * being ACTIVATED); a cold server with `llmDecidesActivation: false`
 * refuses unconditionally with `code: 'llm-activation-disabled'` — the
 * model cannot trigger the first boot on its own.
 */
import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';
import z from 'zod';

import { decideActivation } from '../activation/activation-policy.helper';
import type { ExternalServerRegistry } from '../subprocess/server-registry';

/**
 * True iff a human ack is recorded for `serverId`. Async-capable so the
 * durable pending-acks ledger can back it directly (fresh read per call —
 * an ack recorded mid-session is honoured without a restart).
 */
export type IHasRecordedAck = (serverId: string) => boolean | Promise<boolean>;

/** Fail-closed default when no ledger is composed: no acks are recorded. */
export const noAcksRecorded: IHasRecordedAck = () => false;

export interface IInvokeProxyOptions {
	readonly namespacePrefix: string;
	readonly registry: ExternalServerRegistry;
	/**
	 * AUD-D04: when `false` the model may not activate a server that is
	 * not yet running (`true` by default — `options-schema.ts`).
	 */
	readonly llmDecidesActivation: boolean;
	/** The resolved autonomy knob (`true` by default — gate decision 5). */
	readonly requireHumanAckWhenLlmDecides: boolean;
	/** Injectable pending-ack predicate. Default: {@link noAcksRecorded}. */
	readonly hasRecordedAck?: IHasRecordedAck;
}

const InputSchema = z.object({
	/** Declared server id (`plugins.external-mcps.servers.<id>`). */
	server: z.string().min(1),
	/** Child tool name; a redundant `ext.<server>.` prefix is accepted. */
	tool: z.string().min(1),
	/** Arguments forwarded verbatim as JSON-RPC `params.arguments`. */
	args: z.record(z.string(), z.unknown()).optional(),
});

export const CallOutputSchema = z.object({
	ok: z.boolean(),
	/** Present only on failure — stable, machine-actionable. */
	code: z
		.enum([
			'ack-required',
			'llm-activation-disabled',
			'unknown-server',
			'call-failed',
			'call-timeout',
		])
		.optional(),
	/** Present only on failure — one actionable line. */
	hint: z.string().optional(),
	/** Present only on success — the child's MCP `tools/call` result. */
	result: z.unknown().optional(),
});

/**
 * Accept the fully-qualified `ext.<server>.<tool>` form in `tool` and
 * reduce it to the child's bare tool name. Pure.
 */
export const stripExtPrefix = (server: string, tool: string): string => {
	const qualified = `ext.${server}.`;
	return tool.startsWith(qualified) ? tool.slice(qualified.length) : tool;
};

export const buildCallToolRegistration = (
	options: IInvokeProxyOptions,
): IToolRegistration => {
	const hasRecordedAck = options.hasRecordedAck ?? noAcksRecorded;
	return {
		id: 'call',
		tags: ['external-mcps', 'lazy', 'subprocess'],
		summary:
			'Invoke ext.<server>.<tool> on a declared external MCP server (lazy-boots the child).',
		descriptionKey: 'mcp-vertex_external-mcps_call',
		effects: ['spawn'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_call`,
				{
					description:
						'Invoke ext.<server>.<tool> on a server declared under plugins.external-mcps.servers — the host cannot register child tools on its own surface yet, so this proxy IS the invocation surface for every external tool. The child spawns lazily on the first call and is reused after; failures return structured {ok:false, code, hint} (llm-activation-disabled | ack-required | unknown-server | call-failed | call-timeout), success returns {ok:true, result} with the child MCP tools/call result.',
					inputSchema: InputSchema,
					outputSchema: CallOutputSchema,
				},
				async (args: z.infer<typeof InputSchema>) => {
					const serverId = args.server.trim();
					if (!options.registry.has(serverId)) {
						const declared = options.registry.declaredIds();
						return toolJson({
							ok: false,
							code: 'unknown-server',
							hint: `"${serverId}" is not declared under plugins.external-mcps.servers (declared: ${
								declared.length > 0
									? declared.join(', ')
									: 'none'
							}) — validate a patch with validate_config, then declare it.`,
						});
					}
					// Sync predicates stay synchronous (no microtask before the
					// registry's sync spawn step); only a ledger-backed async
					// predicate defers.
					const recorded = hasRecordedAck(serverId);
					const acked =
						typeof recorded === 'boolean'
							? recorded
							: await recorded;
					// AUD-D04: an already-running child is a normal
					// invocation, not an activation — `status()` is
					// read-only (never boots), so this check cannot itself
					// trigger the spawn it is trying to gate.
					const alreadyActive =
						options.registry
							.status()
							.find((row) => row.id === serverId)?.running ??
						false;
					const decision = decideActivation({
						llmDecidesActivation: options.llmDecidesActivation,
						requireHumanAckWhenLlmDecides:
							options.requireHumanAckWhenLlmDecides,
						alreadyActive,
						hasRecordedAck: acked,
					});
					if (!decision.allowed) {
						return toolJson({
							ok: false,
							code: decision.code,
							hint: decision.hint,
						});
					}
					const outcome = await options.registry.call(
						serverId,
						stripExtPrefix(serverId, args.tool.trim()),
						args.args ?? {},
					);
					if (!outcome.ok) {
						return toolJson({
							ok: false,
							code: outcome.code,
							hint: outcome.message,
						});
					}
					return toolJson({ ok: true, result: outcome.result });
				},
			);
		},
	};
};
