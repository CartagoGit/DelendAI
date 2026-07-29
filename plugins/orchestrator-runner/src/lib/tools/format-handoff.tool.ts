/**
 * format-handoff.tool.ts — `<prefix>_format_handoff` (f00067 S6).
 *
 * Turns an `IRoutingDecision` (from advise_routing / invoke) into a
 * copy-pasteable `cli` command or `curl` template — the safe path when
 * `executeApi:false`. Pure: it formats, it never spawns or spends. An `api`
 * handoff references the key as `$ENV_VAR`, never embedding the secret.
 */
import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';
import type { IRoutingDecision } from '@mcp-vertex/core/public';
import z from 'zod';

import { formatHandoff } from '../invoke/handoff';
import { FormatHandoffOutputSchema, RoutingDecisionSchema } from '../schemas';

export interface IFormatHandoffToolOptions {
	readonly namespacePrefix: string;
}

const InputSchema = z.object({
	decision: RoutingDecisionSchema,
});

export const buildFormatHandoffRegistration = (
	options: IFormatHandoffToolOptions,
): IToolRegistration => ({
	id: 'format_handoff',
	tags: ['orchestrator-runner', 'lazy', 'handoff'],
	summary:
		'Format a routing decision into a ready-to-run CLI command or curl template (no spend).',
	descriptionKey: 'mcp-vertex_orchestrator-runner_format_handoff',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_format_handoff`,
			{
				description:
					'Format a routing decision (from advise_routing or invoke) into a copy-pasteable command: a cli invocation, a curl template, an MCP tools/call sketch, or a passthrough note. The safe path when executeApi:false — it formats, never spawns or spends. An api handoff references the key as $ENV_VAR and never embeds the secret, so the output is safe to log and paste.',
				inputSchema: InputSchema,
				outputSchema: FormatHandoffOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				// x00157 S6: `args.decision` is already runtime-validated by
				// RoutingDecisionSchema — the only mismatch against
				// IRoutingDecision is exactOptionalPropertyTypes: Zod's
				// `.optional()` infers `T | undefined`, while IRoutingDecision's
				// optional fields omit the explicit `undefined`. A single-hop
				// cast (not `as unknown as`) still has TS check the two types
				// are structurally related, unlike the `unknown` bridge this
				// used to go through.
				const formatted = formatHandoff(
					args.decision as IRoutingDecision,
				);
				return toolJson(formatted);
			},
		);
	},
});
