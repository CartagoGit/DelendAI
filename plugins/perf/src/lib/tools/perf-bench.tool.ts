import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	compareToBaseline,
	type IBenchmarkYaml,
	type IRegression,
} from '../bench/bench-comparator';
import { runBench, type IBenchResult } from '../bench/bench-runner';

const BenchInputSchema = z.object({
	name: z.string().min(1),
	samples: z.array(z.number().nonnegative()).min(1),
});

const BenchmarkYamlSchema = z.object({
	entries: z.record(z.string(), z.object({ ops: z.number().positive() })),
});

const BenchResultSchema = z.object({
	name: z.string(),
	ops: z.number(),
	sampleCount: z.number().int().nonnegative(),
	meanMs: z.number().nonnegative(),
	p95Ms: z.number().nonnegative(),
});

const RegressionSchema = z.object({
	name: z.string(),
	baselineOps: z.number().positive(),
	currentOps: z.number(),
	ratio: z.number(),
	threshold: z.number().nonnegative(),
});

export interface IPerfBenchToolOutput {
	readonly results: readonly IBenchResult[];
	readonly regressions: readonly IRegression[];
}

const DEFAULT_THRESHOLD = 0.1;

export const buildPerfBenchRegistration = (options: {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
}): IToolRegistration => ({
	id: 'perf_bench',
	summary:
		'Run named benchmark samples, compute ops/s, and compare against an optional inline baseline.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_perf_bench`,
			{
				description:
					'Run named benchmark sample sets, derive ops/s from mean sample time, and optionally flag regressions against an inline baseline. Offline, read-only.',
				inputSchema: z.object({
					benches: z.array(BenchInputSchema).min(1),
					baseline: BenchmarkYamlSchema.optional(),
					threshold: z.number().min(0).max(1).optional(),
				}),
				outputSchema: z.object({
					results: z.array(BenchResultSchema),
					regressions: z.array(RegressionSchema),
				}),
			},
			async (args: {
				benches: readonly {
					name: string;
					samples: readonly number[];
				}[];
				baseline?: IBenchmarkYaml | undefined;
				threshold?: number | undefined;
			}) => {
				void options.workspaceRootAbs;
				const results = args.benches.map((bench) =>
					runBench(bench.name, bench.samples),
				);
				const threshold = args.threshold ?? DEFAULT_THRESHOLD;
				const regressions =
					args.baseline === undefined
						? []
						: compareToBaseline(args.baseline, results, threshold);

				return toolJson({
					results,
					regressions,
				});
			},
		);
	},
});
