/**
 * self-audit.tool.ts — f00139 S2: `<prefix>_self_audit` registration.
 * S2 wires the S1 aggregator plus the pure ranker; scanner injection
 * stays on the default empty map until S3 plugs real scanners in.
 */
import {
	toolError,
	toolJson,
	type IFinding,
	type IToolRegistration,
} from '@delendai/core/public';

import z from 'zod';

import { aggregateSelfAudit, defaultScannerMap } from '../self-audit/aggregate';
import { rankFindings } from '../self-audit/rank';
import type {
	ISelfAuditScannerRef,
	ISelfAuditScannerRunner,
} from '../contracts/interfaces/self-audit.interface';

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
	readonly scanners?: ReadonlyMap<
		string,
		{
			readonly ref: ISelfAuditScannerRef;
			readonly run: ISelfAuditScannerRunner;
		}
	>;
	readonly topN?: number;
}

const filterFindingsByCapabilities = (
	findings: readonly IFinding[],
	reportCapabilities: Readonly<Record<string, number>>,
	requested: readonly string[] | undefined,
): readonly IFinding[] => {
	if (requested === undefined || requested.length === 0) {
		return findings;
	}
	const matchedCapabilities = requested.filter(
		(capability) => reportCapabilities[capability] !== undefined,
	);
	if (matchedCapabilities.length === 0) {
		return findings;
	}
	// S1 aggregated findings do not yet carry capability provenance, so
	// S2 can only validate the requested capability keys for now.
	return findings;
};

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
					scanners: options.scanners ?? defaultScannerMap(),
				});
				const findings = filterFindingsByCapabilities(
					report.aggregated.findings,
					report.capabilities,
					args.capabilities,
				);
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
