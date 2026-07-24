/**
 * auto-record.tool.ts — `auto_record`: log whether a provider succeeded or
 * failed at a task, so `auto_recommend` can blend the measured win-rate into
 * future rankings (S4). Append-only; the recommendation only shifts once a
 * provider has enough samples. The store is injectable for tests.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import type { ICalibrationStore } from '../contracts/interfaces/calibration.interface';
import { realCalibrationStore } from '../calibrate/store';

export const buildAutoRecordRegistration = (options: {
	readonly namespacePrefix: string;
	/** Absolute dir for the calibration log; omit to disable persistence. */
	readonly calibrationDir?: string;
	/** Injectable store for tests; defaults to the real JSONL store. */
	readonly store?: ICalibrationStore;
}): IToolRegistration => {
	const prefix = options.namespacePrefix;
	const resolveStore = (): ICalibrationStore | undefined =>
		options.store ??
		(options.calibrationDir !== undefined
			? realCalibrationStore(options.calibrationDir)
			: undefined);
	return {
		id: 'auto_record',
		summary:
			'Record a task outcome (success/failure) for a provider so future recommendations learn which one actually wins.',
		tags: ['orchestration'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_auto_record`,
				{
					description:
						'Record whether a provider succeeded or failed at a task, so `auto_recommend` blends the measured win-rate into future rankings. Pass `providerId`, `success` (bool) and optional `taskType`. Persisted locally (append-only); a provider only shifts the ranking once it has enough samples. Never spends, never spawns.',
					inputSchema: z
						.object({
							providerId: z.string().min(1),
							success: z.boolean(),
							taskType: z.string().optional(),
						})
						.strict(),
					outputSchema: z.object({
						recorded: z.boolean(),
						providerId: z.string(),
					}),
				},
				async (args: {
					providerId: string;
					success: boolean;
					taskType?: string | undefined;
				}) => {
					const store = resolveStore();
					if (store === undefined) {
						return toolJson({
							recorded: false,
							providerId: args.providerId,
						});
					}
					await store.append({
						providerId: args.providerId,
						success: args.success,
						...(args.taskType !== undefined
							? { taskType: args.taskType }
							: {}),
					});
					return toolJson({
						recorded: true,
						providerId: args.providerId,
					});
				},
			);
		},
	};
};
