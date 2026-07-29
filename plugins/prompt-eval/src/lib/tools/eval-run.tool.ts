import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';
import type { ICalibrationStore } from '@mcp-vertex/auto-agent-selector/public';

import {
	runEvalHarness,
	type IEvalHarnessDeps,
	type IEvalProvider,
} from '../eval/eval-harness';
import { writeOutcomes } from '../calibrate/write-through';

export interface IEvalRunToolOptions extends IEvalHarnessDeps {
	readonly namespacePrefix: string;
	readonly providers: readonly IEvalProvider[];
	readonly calibrationStore?: ICalibrationStore;
}

const INPUT = z
	.object({
		prompt: z.string().min(1).max(20_000),
		taskType: z.string().min(1).max(80).optional(),
		consent: z.literal(true),
	})
	.strict();

/** Explicit-consent evaluation across the currently reachable ranked roster. */
export const buildEvalRunRegistration = (
	options: IEvalRunToolOptions,
): IToolRegistration => ({
	id: 'eval_run',
	tags: ['evaluation', 'spend', 'routing'],
	effects: ['network', 'spawn'],
	summary:
		'Evaluate an explicitly approved prompt across reachable providers.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_eval_run`,
			{
				description:
					'Evaluate a prompt across the configured ranked provider roster. Explicit consent is mandatory; each provider is independently checked by the spend guard before it runs. Returns every attempted provider, cost, acceptance result and the cheapest passing provider.',
				inputSchema: INPUT,
				outputSchema: z.object({
					tool: z.literal('eval_run'),
					taskType: z.string().nullable(),
					attempts: z.array(
						z.object({
							providerId: z.string(),
							costTier: z.number(),
							costUsd: z.number(),
							passed: z.boolean(),
							skipped: z.literal('spend-denied').optional(),
						}),
					),
					passed: z.number(),
					totalCostUsd: z.number(),
					winner: z.string().nullable(),
				}),
			},
			async (args: {
				prompt: string;
				taskType?: string | undefined;
				consent: true;
			}) => {
				if (options.providers.length === 0) {
					return toolError(
						'No reachable providers are available for evaluation.',
						'Re-run provider discovery and configure a reachable provider before evaluating.',
					);
				}
				try {
					const result = await runEvalHarness(
						{ prompt: args.prompt, providers: options.providers },
						options,
					);
					await writeOutcomes(
						{
							attempts: result.attempts,
							winner: result.winner,
							...(args.taskType === undefined
								? {}
								: { taskType: args.taskType }),
						},
						options.calibrationStore === undefined
							? {}
							: { store: options.calibrationStore },
					);
					return toolJson({
						tool: 'eval_run',
						taskType: args.taskType ?? null,
						...result,
					});
				} catch (error) {
					return toolError((error as Error).message);
				}
			},
		);
	},
});
