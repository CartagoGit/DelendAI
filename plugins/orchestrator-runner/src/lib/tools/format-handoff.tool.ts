/**
 * format-handoff.tool.ts — `<prefix>_format_handoff` (f00067 S6).
 *
 * Turns an `IRoutingDecision` (from advise_routing / invoke) into a
 * copy-pasteable `cli` command or `curl` template — the safe path when
 * `executeApi:false`. Pure: it formats, it never spawns or spends. An `api`
 * handoff references the key as `$ENV_VAR`, never embedding the secret.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import type { IHandoffDecision } from '../contracts/interfaces/handoff-decision.interface';
import { formatHandoff } from '../invoke/handoff';
import { InvokeSchema } from '../options';
import {
	CostTierSchema,
	FormatHandoffOutputSchema,
	ModeSchema,
} from '../schemas';

export interface IFormatHandoffToolOptions {
	readonly namespacePrefix: string;
}

// `formatHandoff` only reads `invoke`/`prompt`/`mode`/
// `targetProvider.{id,modelId}`/`estimatedCostTier` (see
// `../invoke/handoff.ts`) — accepting only that slice keeps the
// advertised input proportional to what the tool consumes, instead of
// re-declaring the full `IRoutingDecision` (with its recursive
// `alternates` roster and `scoringTrace`) as a required argument. A
// caller holding a full decision from `advise_routing`/`invoke` still
// satisfies this schema: extra properties on the argument object are
// accepted and ignored, never rejected.
const DecisionSchema = z.object({
	invoke: InvokeSchema,
	prompt: z.string(),
	mode: ModeSchema,
	targetProvider: z.object({
		id: z.string(),
		modelId: z.string(),
	}),
	estimatedCostTier: CostTierSchema,
});

const InputSchema = z.object({
	decision: DecisionSchema,
});

export const buildFormatHandoffRegistration = (
	options: IFormatHandoffToolOptions,
): IToolRegistration => ({
	id: 'format_handoff',
	tags: ['orchestrator-runner', 'lazy', 'handoff'],
	summary:
		'Format a routing decision into a ready-to-run CLI command or curl template (no spend).',
	descriptionKey: 'delendai_orchestrator-runner_format_handoff',
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
				// `args.decision` is already runtime-validated by
				// `DecisionSchema` — the only mismatch against
				// `IHandoffDecision` is `exactOptionalPropertyTypes`: Zod's
				// `.optional()` infers `T | undefined`, while the core
				// invoke union's optional fields omit the explicit
				// `undefined`. A single-hop cast (not `as unknown as`)
				// still has TS check the two types are structurally
				// related.
				const formatted = formatHandoff(
					args.decision as IHandoffDecision,
				);
				return toolJson(formatted);
			},
		);
	},
});
