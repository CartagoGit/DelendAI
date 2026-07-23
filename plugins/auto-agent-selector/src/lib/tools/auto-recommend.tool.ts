import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { discoverRoster } from '../discovery/discover-roster';
import { realDiscoveryDeps } from '../discovery/real-deps';
import { rankProviders } from '../routing/rank-providers';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';

const RANKED_SCHEMA = z.object({
	id: z.string(),
	label: z.string(),
	source: z.enum(['cli', 'api']),
	costTier: z.number(),
	score: z.number(),
	rationale: z.string(),
	pinned: z.boolean(),
});

const OUTPUT_SCHEMA = z.object({
	/** The top pick — a recommendation, not a command. You decide. */
	recommended: RANKED_SCHEMA.nullable(),
	/** Every reachable provider, best-first, each with its rationale. */
	ranked: z.array(RANKED_SCHEMA),
	/** The cost↔quality dial actually used (0 strongest … 10 cheapest). */
	costQualityTradeoff: z.number(),
	/** Present + reachable pin id, or null. */
	pinned: z.string().nullable(),
});

/**
 * `auto_recommend` — rank the reachable providers for a task and RECOMMEND the
 * best-value one, with a transparent rationale per option. It never spends and
 * never dictates: a reachable pin always wins, and the caller decides.
 */
export const buildAutoRecommendRegistration = (options: {
	readonly namespacePrefix: string;
	/** Plugin-configured dial default (0 strongest … 10 cheapest). */
	readonly defaultTradeoff: number;
	/** Injectable for tests; defaults to the real PATH + env probe. */
	readonly deps?: IDiscoveryDeps;
}): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'auto_recommend',
		summary:
			'Rank reachable providers for a task and recommend the best-value one (cost↔quality dial + optional pin). Advisory: you decide.',
		tags: ['orchestration'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_auto_recommend`,
				{
					description:
						'Rank the reachable LLM/agent providers for a task and recommend the most cost-effective one, with a plain-language rationale for every option (cost tier, fit for your cost↔quality setting, pin). Pass `costQualityTradeoff` (0 = always the strongest model, 10 = the cheapest that works) to override the configured default, and `pin` to force a provider you prefer — a reachable pin always ranks first. Headless and advisory: it never spawns anything, never spends, and never overrides your choice.',
					inputSchema: z
						.object({
							costQualityTradeoff: z
								.number()
								.int()
								.min(0)
								.max(10)
								.optional(),
							pin: z.string().min(1).optional(),
						})
						.strict(),
					outputSchema: OUTPUT_SCHEMA,
				},
				async (args: {
					costQualityTradeoff?: number | undefined;
					pin?: string | undefined;
				}) => {
					const roster = await discoverRoster(
						options.deps ?? realDiscoveryDeps(),
					);
					const tradeoff =
						args.costQualityTradeoff ?? options.defaultTradeoff;
					const ranked = rankProviders({
						available: roster.available,
						costQualityTradeoff: tradeoff,
						pinnedId: args.pin,
					});
					const rows = ranked.map((r) => ({
						id: r.candidate.id,
						label: r.candidate.label,
						source: r.candidate.source,
						costTier: r.candidate.costTier,
						score: r.score,
						rationale: r.rationale,
						pinned: r.pinned,
					}));
					const pinnedRow = rows.find((r) => r.pinned);
					return toolJson({
						recommended: rows[0] ?? null,
						ranked: rows,
						costQualityTradeoff: tradeoff,
						pinned: pinnedRow?.id ?? null,
					});
				},
			);
		},
	};
};
