/**
 * compaction-check.tool.ts — the `memory_compaction_check` tool (f00090 S2).
 *
 * The complement to `memory_compact`: it answers *when* compaction is worth it.
 * S2 shipped the pure `evaluateCompactionTrigger` heuristic but left it unwired;
 * this thin, read-only tool is its live surface. The agent passes the only
 * state that lives outside the plugin — its carried, distillable tail size and
 * how many turns have elapsed since the last compaction — and gets back a
 * deterministic recommendation ("compact now?" + a one-line hint). No store
 * I/O, no side effects: the tool is a pure adapter over the heuristic, so the
 * decision is a function of its input alone (SRP — the signal is the agent's,
 * the policy is the plugin's). This closes the loop: **check → compact →
 * recall the digest** (all under `memory_*`, one mental model).
 */
import { z } from 'zod';

import type {
	IToolRegistration,
	IToolTextResult,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { evaluateCompactionTrigger } from '../services/compaction-trigger';

export interface ICompactionCheckToolOptions {
	readonly namespacePrefix: string;
}

/**
 * Build the `memory_compaction_check` registration. Pure + read-only: it never
 * touches the store, so it carries no `effects` and is safe to call as often as
 * the agent wants during a long chat ("cada cierto tiempo").
 */
export const buildCompactionCheckToolRegistration = (
	options: ICompactionCheckToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'compaction_check',
		summary:
			'Check whether the carried context tail is worth compacting now (deterministic).',
		tags: ['memory', 'token-efficiency', 'lazy'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_compaction_check`,
				{
					description:
						'Ask WHEN to compact: pass your current carried, distillable tail size (`carriedTailTokens`) and how many turns have elapsed since your last compaction (`turnsSinceLastCompaction`), and get back a deterministic recommendation. `shouldCompact` fires when the tail crosses `tokenThreshold` (default 8000) OR `turnThreshold` (default 25) turns elapse; token pressure wins the tie-break. Read-only, no side effects — call it periodically in a long chat, then run memory_compact when it says so. This is the WHEN half of the loop; memory_compact is the HOW, and memory_recall surfaces the resulting session digest.',
					inputSchema: z.object({
						carriedTailTokens: z.number().int().nonnegative(),
						turnsSinceLastCompaction: z
							.number()
							.int()
							.nonnegative(),
						tokenThreshold: z.number().int().positive().optional(),
						turnThreshold: z.number().int().positive().optional(),
					}),
					outputSchema: z.object({
						shouldCompact: z.boolean(),
						reason: z.enum([
							'token-threshold',
							'turn-threshold',
							'below-threshold',
						]),
						carriedTailTokens: z.number(),
						tokenThreshold: z.number(),
						turnsSinceLastCompaction: z.number(),
						turnThreshold: z.number(),
						hint: z.string(),
					}),
				},
				async (args: {
					carriedTailTokens: number;
					turnsSinceLastCompaction: number;
					tokenThreshold?: number | undefined;
					turnThreshold?: number | undefined;
				}): Promise<IToolTextResult> =>
					toolJson(
						evaluateCompactionTrigger(
							{
								carriedTailTokens: args.carriedTailTokens,
								turnsSinceLastCompaction:
									args.turnsSinceLastCompaction,
							},
							{
								...(args.tokenThreshold !== undefined
									? { tokenThreshold: args.tokenThreshold }
									: {}),
								...(args.turnThreshold !== undefined
									? { turnThreshold: args.turnThreshold }
									: {}),
							},
						),
					),
			);
		},
	};
};
