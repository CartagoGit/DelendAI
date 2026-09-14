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
import z from 'zod';

import type { IToolRegistration, IToolTextResult } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import { decideAutoCompaction } from '../compaction/auto-compaction-policy.helper';
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
						// Both halves or neither: a ratio built from one of
						// them is a number nobody can audit.
						contextBudgetTokens: z
							.number()
							.int()
							.positive()
							.optional(),
						contextUsedTokens: z
							.number()
							.int()
							.nonnegative()
							.optional(),
						largestTopicItems: z
							.number()
							.int()
							.nonnegative()
							.optional(),
						totalItems: z.number().int().nonnegative().optional(),
					}),
					outputSchema: z.object({
						shouldCompact: z.boolean(),
						reason: z.enum([
							'token-threshold',
							'turn-threshold',
							'budget-pressure',
							'topic-saturation',
							'below-threshold',
						]),
						binding: z.boolean(),
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
					contextBudgetTokens?: number | undefined;
					contextUsedTokens?: number | undefined;
					largestTopicItems?: number | undefined;
					totalItems?: number | undefined;
				}): Promise<IToolTextResult> => {
					const thresholds = {
						...(args.tokenThreshold !== undefined
							? { tokenThreshold: args.tokenThreshold }
							: {}),
						...(args.turnThreshold !== undefined
							? { turnThreshold: args.turnThreshold }
							: {}),
					};
					// The two answers are deliberately both computed. The
					// legacy fields come from the agent-facing heuristic, so
					// a caller that already reads them sees exactly what it
					// saw before; `reason` and `binding` come from the
					// policy, which knows about the window and the topics
					// and is the thing that would fire unattended.
					const heuristic = evaluateCompactionTrigger(
						{
							carriedTailTokens: args.carriedTailTokens,
							turnsSinceLastCompaction:
								args.turnsSinceLastCompaction,
						},
						thresholds,
					);
					const policy = decideAutoCompaction(
						{
							carriedTailTokens: args.carriedTailTokens,
							turnsSinceLastCompaction:
								args.turnsSinceLastCompaction,
							...(args.contextBudgetTokens !== undefined
								? {
										contextBudgetTokens:
											args.contextBudgetTokens,
									}
								: {}),
							...(args.contextUsedTokens !== undefined
								? { contextUsedTokens: args.contextUsedTokens }
								: {}),
							...(args.largestTopicItems !== undefined
								? { largestTopicItems: args.largestTopicItems }
								: {}),
							...(args.totalItems !== undefined
								? { totalItems: args.totalItems }
								: {}),
						},
						thresholds,
					);

					return toolJson({
						...heuristic,
						shouldCompact: policy.shouldCompact,
						reason: policy.trigger,
						binding: policy.binding,
						hint: policy.hint,
					});
				},
			);
		},
	};
};
