import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import type { ICalibrationStore } from '../../../../auto-agent-selector/src/lib/contracts/interfaces/calibration.interface';
import {
	realPromptEvalCalibrationStore,
	writeCalibration,
} from '../calibrate/write-through';
import type { IEvalAttempt } from '../eval/eval-harness';

export interface IEvalCalibrateToolOptions {
	readonly namespacePrefix: string;
	readonly calibrationDir?: string;
	readonly store?: ICalibrationStore;
	readonly minSamples?: number;
}

const ATTEMPT = z.object({
	providerId: z.string(),
	costTier: z.number().int().min(1).max(5),
	costUsd: z.number().nonnegative(),
	passed: z.boolean(),
	skipped: z.literal('spend-denied').optional(),
});

const OUTPUT = z.object({
	tool: z.literal('eval_calibrate'),
	recorded: z.number().int().nonnegative(),
	taskType: z.string().nullable(),
	winRates: z.array(
		z.object({
			providerId: z.string(),
			winRate: z.number(),
			samples: z.number().int().nonnegative(),
		}),
	),
});

export const buildEvalCalibrateToolRegistration = (
	options: IEvalCalibrateToolOptions,
): IToolRegistration => ({
	id: 'eval_calibrate',
	tags: ['evaluation', 'routing'],
	summary:
		'Persist eval outcomes into the auto-agent-selector calibration store and return the measured win-rates.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_eval_calibrate`,
			{
				description:
					'Persist a flat list of eval attempts into the shared auto-agent-selector calibration store (same JSONL location and schema that routing reads), then return the measured provider win-rates for the task type. Pure write-through: skipped attempts are ignored, nothing spawns, nothing spends.',
				inputSchema: z
					.object({
						attempts: z.array(ATTEMPT).min(1),
						taskType: z.string().min(1).max(80).optional(),
					})
					.strict(),
				outputSchema: OUTPUT,
			},
			async (args: {
				attempts: readonly IEvalAttempt[];
				taskType?: string | undefined;
			}) => {
				const store =
					options.store ??
					(options.calibrationDir !== undefined
						? realPromptEvalCalibrationStore(options.calibrationDir)
						: undefined);
				if (store === undefined) {
					return toolError(
						'eval_calibrate has no calibration store configured.',
						'Load prompt-eval through the plugin host so it can resolve auto-agent-selector results storage.',
					);
				}
				const result = await writeCalibration(
					{
						attempts: args.attempts,
						...(args.taskType !== undefined
							? { taskType: args.taskType }
							: {}),
					},
					{
						store,
						...(options.minSamples !== undefined
							? { minSamples: options.minSamples }
							: {}),
					},
				);
				return toolJson({
					tool: 'eval_calibrate',
					...result,
				});
			},
		);
	},
});
