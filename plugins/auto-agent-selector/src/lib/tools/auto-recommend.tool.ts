import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { discoverAndPersistRoster } from '../discovery/discover-roster';
import { realDiscoveryDeps } from '../discovery/real-deps';
import { rankProviders } from '../routing/rank-providers';
import { resolveTaskPin } from '../prefs/resolve-task-pin';
import { realCalibrationStore } from '../calibrate/store';
import { winRateMap } from '../calibrate/win-rates';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import type { ICalibrationStore } from '../contracts/interfaces/calibration.interface';
import type { IRosterSnapshotStore } from '../discovery/roster-store';

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
	/** How many providers had enough measured samples to influence ranking. */
	calibratedProviders: z.number(),
});

/**
 * `auto_recommend` — rank the reachable providers for a task and RECOMMEND the
 * best-value one, with a transparent rationale per option. It never spends and
 * never dictates: a reachable pin always wins, and the caller decides. When a
 * calibration log exists, measured win-rates are blended into the ranking.
 */
export const buildAutoRecommendRegistration = (options: {
	readonly namespacePrefix: string;
	/** Plugin-configured dial default (0 strongest … 10 cheapest). */
	readonly defaultTradeoff: number;
	/** Injectable for tests; defaults to the real PATH + env probe. */
	readonly deps?: IDiscoveryDeps;
	/** Absolute dir for the calibration log; omit to disable calibration. */
	readonly calibrationDir?: string;
	/** Injectable calibration store for tests; defaults to the JSONL store. */
	readonly store?: ICalibrationStore;
	readonly taskPins?: Readonly<Record<string, string>>;
	readonly rosterStore?: IRosterSnapshotStore;
}): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'auto_recommend',
		summary:
			'Rank reachable providers for a task and recommend the best-value one (cost↔quality dial + optional pin, measured win-rates). Advisory: you decide.',
		tags: ['orchestration'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_auto_recommend`,
				{
					description:
						'Rank the reachable LLM/agent providers for a task and recommend the most cost-effective one, with a plain-language rationale for every option (cost tier, fit for your cost↔quality setting, measured win-rate, pin). Pass `costQualityTradeoff` (0 = always the strongest model, 10 = the cheapest that works) to override the configured default, and `pin` to force a provider you prefer — a reachable pin always ranks first. Headless and advisory: it never spawns anything, never spends, and never overrides your choice.',
					inputSchema: z
						.object({
							costQualityTradeoff: z
								.number()
								.int()
								.min(0)
								.max(10)
								.optional(),
							pin: z.string().min(1).optional(),
							taskType: z.string().min(1).max(80).optional(),
						})
						.strict(),
					outputSchema: OUTPUT_SCHEMA,
				},
				async (args: {
					costQualityTradeoff?: number | undefined;
					pin?: string | undefined;
					taskType?: string | undefined;
				}) => {
					const roster = await discoverAndPersistRoster(
						options.deps ?? realDiscoveryDeps(),
						options.rosterStore,
					);
					const tradeoff =
						args.costQualityTradeoff ?? options.defaultTradeoff;
					const store =
						options.store ??
						(options.calibrationDir !== undefined
							? realCalibrationStore(options.calibrationDir)
							: undefined);
					const calibration =
						store !== undefined
							? winRateMap(await store.readAll())
							: undefined;
					const ranked = rankProviders({
						available: roster.available,
						costQualityTradeoff: tradeoff,
						pinnedId: resolveTaskPin(
							args.pin,
							args.taskType,
							options.taskPins,
						),
						...(calibration !== undefined ? { calibration } : {}),
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
						calibratedProviders: calibration?.size ?? 0,
					});
				},
			);
		},
	};
};
