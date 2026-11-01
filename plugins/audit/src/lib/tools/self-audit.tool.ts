/**
 * self-audit.tool.ts — `<prefix>_self_audit` registration.
 * Wires the aggregator plus the pure ranker. Without injected scanners
 * it runs the default secret and dependency scanners.
 */
import { toolError, toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';

import z from 'zod';

import { aggregateSelfAudit } from '../self-audit/aggregate';
import { buildDefaultScanners } from '../self-audit/default-scanners';
import { rankFindings } from '../self-audit/rank';
import type { ISelfAuditScannerEntry } from '../contracts/interfaces/self-audit.interface';

const SelfAuditInputSchema = z.object({
	limit: z.number().int().min(1).max(100).optional(),
	capabilities: z.array(z.string()).optional(),
});

const SelfAuditOutputSchema = z.object({
	ranAt: z.string(),
	worst: z.enum(['critical', 'high', 'medium', 'low', 'info', 'none']),
	summary: z.object({
		critical: z.number(),
		high: z.number(),
		medium: z.number(),
		low: z.number(),
		info: z.number(),
	}),
	skipped: z.array(
		z.object({
			id: z.string(),
			note: z.string().optional(),
		}),
	),
	scannerCount: z.number().optional(),
	capabilities: z.record(z.string(), z.number()).optional(),
	backlog: z.array(
		z.object({
			rank: z.number(),
			score: z.number(),
			rationale: z.string(),
			finding: z.object({
				ruleId: z.string(),
				severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
				message: z.string(),
				location: z
					.object({
						file: z.string(),
						line: z.number().optional(),
						endLine: z.number().optional(),
					})
					.optional(),
				fix: z.string().optional(),
			}),
		}),
	),
});

export interface ISelfAuditToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly scanners?: ReadonlyMap<string, ISelfAuditScannerEntry>;
	readonly topN?: number;
}

export const buildSelfAuditRegistration = (
	options: ISelfAuditToolOptions,
): IToolRegistration => ({
	id: 'self_audit',
	summary: 'Aggregate self-audit findings into one ranked action backlog.',
	descriptionKey: 'self_audit',
	tags: ['audit', 'self-improvement'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_self_audit`,
			{
				description:
					'Run the self-audit aggregation and return a ranked action backlog with rationale for the top findings.',
				inputSchema: SelfAuditInputSchema,
				outputSchema: SelfAuditOutputSchema,
			},
			async (args: {
				limit?: number | undefined;
				topN?: number | undefined;
				capabilities?: readonly string[] | undefined;
			}) => {
				const report = await aggregateSelfAudit({
					workspaceRootAbs: options.workspaceRootAbs,
					scanners: options.scanners ?? buildDefaultScanners(),
					...(args.capabilities !== undefined
						? { capabilities: args.capabilities }
						: {}),
				});
				const findings = report.aggregated.findings;
				const limit = args.limit ?? args.topN ?? options.topN ?? 20;

				try {
					return toolJson({
						ranAt: report.ranAt,
						worst: report.worst,
						summary: report.aggregated.summary,
						skipped: report.skipped,
						scannerCount: report.scannerCount,
						capabilities: report.capabilities,
						backlog: rankFindings(findings, {
							limit,
						}),
					});
				} catch (error: unknown) {
					if (error instanceof RangeError) {
						return toolError(
							error.message,
							'Use a limit between 1 and 100.',
						);
					}
					throw error;
				}
			},
		);
	},
});
