import z from 'zod';

import {
	buildTemplatedPrompt,
	type ITemplatedPromptRegistration,
} from './shared';

const OptimizeArgsSchema = z
	.object({
		file: z.string().min(1),
	})
	.strict();

export type IOptimizeThisArgs = z.infer<typeof OptimizeArgsSchema>;

export const buildOptimizeThisPrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<IOptimizeThisArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'optimize-this',
		description:
			'Drive a performance pass for one file with shipped perf tools and the relevant quality gate.',
		argsSchema: OptimizeArgsSchema,
		arguments: [
			{
				name: 'file',
				description: 'Workspace-relative file path to optimize.',
				required: true,
			},
		],
		template: ({ file }) =>
			[
				`Optimize the code around ${file}.`,
				'',
				'Use `delendai_perf_perf_profile` to identify hotspots or bounded runtime summaries for the relevant path.',
				'Use `delendai_perf_perf_bench` to capture reproducible before and after measurements.',
				'Use `delendai_perf_perf_bundle` when the file contributes to build or bundle size risk.',
				'After any edit, run the relevant scope through `delendai_quality_run_quality` so speedups do not regress correctness.',
				'',
				'Deliverables:',
				'- baseline signal',
				'- likely bottleneck',
				'- smallest plausible optimization',
				'- trade-offs or readability costs',
				'- validation plan for the claimed win',
				'',
				'Avoid speculative rewrites; make the optimization evidence-led and reversible.',
			].join('\n'),
	});
