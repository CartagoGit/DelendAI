import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import { computeWinRates } from '../calibrate/win-rates';
import { realCalibrationStore } from '../calibrate/store';
import { discoverRosterForTool } from '../discovery/real-deps';
import { MAX_TASK_TYPE_LENGTH } from '../contracts/constants/tradeoff.constant';
import type { ICalibrationStore } from '../contracts/interfaces/calibration.interface';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from '../discovery/roster-store';

const OUTPUT_SCHEMA = z.object({
	taskType: z.string().nullable(),
	winRates: z.array(
		z.object({
			providerId: z.string(),
			winRate: z.number(),
			samples: z.number(),
		}),
	),
	unseenProviders: z.array(z.string()),
	marketLookup: z.literal('not-requested'),
});

/** Explain calibration evidence and newly discovered providers without spending. */
export const buildAutoEvaluateRegistration = (options: {
	readonly namespacePrefix: string;
	readonly calibrationDir?: string;
	readonly store?: ICalibrationStore;
	readonly deps?: IDiscoveryDeps;
	readonly rosterStore?: IRosterSnapshotStore;
}): IToolRegistration => ({
	id: 'auto_evaluate',
	summary:
		'Evaluate observed provider win-rates and flag newly reachable providers for review (no spend).',
	tags: ['orchestration', 'evaluation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_auto_evaluate`,
			{
				description:
					'Explain the locally recorded success evidence per provider and task type, then flag newly reachable providers without enough evidence. This never contacts a provider or spends money.',
				inputSchema: z
					.object({
						taskType: z
							.string()
							.min(1)
							.max(MAX_TASK_TYPE_LENGTH)
							.optional(),
					})
					.strict(),
				outputSchema: OUTPUT_SCHEMA,
			},
			async (args: { taskType?: string | undefined }) => {
				const roster = await discoverRosterForTool(
					options.deps,
					options.rosterStore,
				);
				const store =
					options.store ??
					(options.calibrationDir
						? realCalibrationStore(options.calibrationDir)
						: undefined);
				const records = store ? await store.readAll() : [];
				const winRates = computeWinRates(
					records,
					undefined,
					args.taskType,
				);
				const measured = new Set(
					winRates.map((rate) => rate.providerId),
				);
				return toolJson({
					taskType: args.taskType ?? null,
					winRates,
					unseenProviders: roster.available
						.filter((provider) => !measured.has(provider.id))
						.map((provider) => provider.id),
					marketLookup: 'not-requested' as const,
				});
			},
		);
	},
});
