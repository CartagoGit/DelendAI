import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	correlateErrorsWithLocal,
	DEFAULT_CORRELATE_WINDOW_MINUTES,
	type IReadLocalCorrelateDeps,
} from '../correlate';
import type { IObsIssue } from '../errors/ierror-source';

export interface IObsCorrelateToolOptions {
	readonly namespacePrefix: string;
	readonly issueReader?: (input: {
		readonly sinceMinutes: number;
	}) => Promise<readonly IObsIssue[]>;
	readonly localDeps?: IReadLocalCorrelateDeps;
	readonly now?: () => Date;
}

const INPUT = z
	.object({
		sinceMinutes: z.number().int().min(1).max(10_080).default(1_440),
	})
	.strict();

const OUTPUT = z.object({
	matches: z.array(
		z.object({
			issueId: z.string(),
			logFile: z.string(),
			line: z.number().int().positive(),
			summary: z.string(),
		}),
	),
	totalIssues: z.number().int().nonnegative(),
	totalLogs: z.number().int().nonnegative(),
	summary: z.string(),
});

const missingSourceError = () =>
	toolError(
		'obs_correlate is not configured with an observability issue reader.',
		'Configure an observability source first so `obs_errors` can list recent issues, then wire that reader into `obs_correlate`.',
	);

const missingLocalDepsError = () =>
	toolError(
		'obs_correlate is not configured with a local logs reader.',
		'Pass `workspaceRootAbs` through the plugin wiring and inject local correlation deps in tests or alternate hosts.',
	);

const buildSummary = (input: {
	readonly sinceMinutes: number;
	readonly issueCount: number;
	readonly logCount: number;
	readonly metricCount: number;
	readonly matchCount: number;
}): string => {
	const metricsSuffix =
		input.metricCount > 0 ? ` and ${input.metricCount} metric row(s)` : '';
	return `Correlated ${input.matchCount} match(es) across ${input.issueCount} remote issue(s), ${input.logCount} local log line(s)${metricsSuffix} in the last ${input.sinceMinutes} minute(s).`;
};

export const buildObsCorrelateToolRegistration = (
	options: IObsCorrelateToolOptions,
): IToolRegistration => ({
	id: 'obs_correlate',
	tags: ['observability', 'logs', 'metrics'],
	summary: 'Correlate remote observability issues with recent local logs.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_obs_correlate`,
			{
				description:
					'List recent remote observability issues and correlate them with local JSONL log lines that mention the same exception title or context within a recent window.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				if (options.issueReader === undefined) {
					return missingSourceError();
				}
				if (options.localDeps === undefined) {
					return missingLocalDepsError();
				}
				const now = options.now?.() ?? new Date();
				const sinceMinutes =
					args.sinceMinutes ?? DEFAULT_CORRELATE_WINDOW_MINUTES;
				const since = new Date(
					now.getTime() - sinceMinutes * 60_000,
				).toISOString();
				try {
					const [issues, localLogs, localMetrics] = await Promise.all(
						[
							options.issueReader({ sinceMinutes }),
							options.localDeps.listLocalLogs({ since }),
							options.localDeps.listLocalMetrics({ since }),
						],
					);
					const { matches } = correlateErrorsWithLocal({
						issues,
						localLogs,
						localMetrics,
						now,
						sinceMinutes,
					});
					return toolJson({
						matches,
						totalIssues: issues.length,
						totalLogs: localLogs.length,
						summary: buildSummary({
							sinceMinutes,
							issueCount: issues.length,
							logCount: localLogs.length,
							metricCount: localMetrics.length,
							matchCount: matches.length,
						}),
					});
				} catch (error) {
					return toolError((error as Error).message);
				}
			},
		);
	},
});
