/**
 * f00127 S2 — `eval_report` tool.
 *
 * Pure planner over an injected attempt list. The host pipes the
 * `eval_run` output (or a stored replay) into here and gets back a
 * ranked report (winner + per-provider rows + a tiny markdown table for
 * the CLI). No I/O: the calibration write-through is S3.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import type { IEvalAttempt } from '../eval/eval-harness';
import { scoreReport, type IProviderScore } from '../score/score';

export interface IEvalReportToolOptions {
	readonly namespacePrefix: string;
}

const ATTEMPT = z.object({
	providerId: z.string(),
	costTier: z.number().int().min(1).max(5),
	costUsd: z.number().nonnegative(),
	passed: z.boolean(),
	skipped: z.literal('spend-denied').optional(),
});

const RANKED_ROW = z.object({
	providerId: z.string(),
	costTier: z.number(),
	attempts: z.number(),
	passes: z.number(),
	winRate: z.number().nullable(),
	totalCostUsd: z.number(),
	compositeScore: z.number(),
});

const REPORT_OUTPUT = z.object({
	tool: z.literal('eval_report'),
	rows: z.array(RANKED_ROW),
	winner: z.string().nullable(),
	worst: z.string().nullable(),
	totalCostUsd: z.number(),
	totalPasses: z.number(),
	markdown: z.string(),
});

const pct = (value: number | null): string =>
	value === null ? '—' : `${Math.round(value * 100)}%`;

const usd = (value: number): string =>
	`$${value.toFixed(Math.abs(value) < 0.01 ? 4 : 2)}`;

const renderMarkdownTable = (rows: readonly IProviderScore[]): string => {
	const header = '| Provider | Tier | Att | Pass | Win-rate | Cost | Score |';
	const separator = '|---|---|---|---|---|---|---|';
	const body = rows.map((r) => {
		const cost = usd(r.totalCostUsd);
		const score = r.compositeScore.toFixed(2);
		return `| ${r.providerId} | ${r.costTier} | ${r.attempts} | ${r.passes} | ${pct(r.winRate)} | ${cost} | ${score} |`;
	});
	return [header, separator, ...body].join('\n');
};

export const buildEvalReportToolRegistration = (
	options: IEvalReportToolOptions,
): IToolRegistration => ({
	id: 'eval_report',
	tags: ['evaluation', 'routing'],
	summary:
		'Score a list of eval attempts and emit a ranked cost×quality report.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_eval_report`,
			{
				description:
					'Score a flat list of `IEvalAttempt`s and return a ranked cost×quality report. Pure: no I/O, no spawn. Output includes the winner (cheapest passing provider), per-provider rows (compositeScore, winRate, totalCostUsd) and a Markdown table for the CLI. Pipe the output of `eval_run` straight in, or replay a stored attempt log.',
				inputSchema: z.object({
					attempts: z.array(ATTEMPT).min(1),
				}),
				outputSchema: REPORT_OUTPUT,
			},
			async (args: { attempts: readonly IEvalAttempt[] }) => {
				if (args.attempts.length === 0) {
					return toolError(
						'eval_report received an empty attempt list.',
						'Pipe the `eval_run` output or replay a stored attempt log.',
					);
				}
				const report = scoreReport(args.attempts);
				return toolJson({
					tool: 'eval_report',
					...report,
					markdown: renderMarkdownTable(report.rows),
				});
			},
		);
	},
});
