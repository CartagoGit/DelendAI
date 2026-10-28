/**
 * debt-scan.tool.ts — `debt_scan`: find tech-debt marker comments
 * (TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE) across the workspace and report
 * them as severity-ranked findings. Composes the r00012 finding helpers; the
 * reader is injectable, so the tool is testable. Offline, read-only.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { sortFindings, toolJson } from '@delendai/core/public';
import { findingsReport } from '@delendai/core/runtime';

import {
	TECH_DEBT_MAX_FILES,
	TECH_DEBT_MAX_REPORTED,
	TECH_DEBT_MAX_SKIPPED_REPORTED,
} from '../contracts/constants/tech-debt.constant';
import type { ITechDebtScanToolOptions } from '../contracts/interfaces/tech-debt.interface';
import { realTechDebtDeps } from '../tech-debt/real-deps';
import { scanMarkers } from '../tech-debt/scan-markers';

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
});

export const buildDebtScanRegistration = (
	options: ITechDebtScanToolOptions,
): IToolRegistration => ({
	id: 'debt_scan',
	summary:
		'Find tech-debt markers (TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE) across the workspace, ranked by severity. Offline.',
	tags: ['tech-debt', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_debt_scan`,
			{
				description:
					'Scan source comments for tech-debt markers and return severity-ranked findings: FIXME/BUG (high), XXX/HACK/DEPRECATED (medium), TODO (low), NOTE (info). Skips node_modules, dist, build, .cache, .git. Offline, read-only. Optionally filter to `only` marker kinds (e.g. ["FIXME","TODO"]).',
				inputSchema: z.object({
					only: z.array(z.string()).optional(),
				}),
				outputSchema: z.object({
					filesScanned: z.number(),
					total: z.number(),
					findings: z.array(FINDING),
					truncated: z.boolean(),
					coverage: z.object({
						capped: z.boolean(),
						maxFiles: z.number(),
						skippedTotal: z.number(),
						skipped: z.array(
							z.object({
								path: z.string(),
								reason: z.enum(['too-large', 'unreadable']),
							}),
						),
					}),
					summary: z.object({
						critical: z.number(),
						high: z.number(),
						medium: z.number(),
						low: z.number(),
						info: z.number(),
					}),
					worst: z.string(),
				}),
			},
			async (args: { only?: string[] | undefined }) => {
				const deps =
					options.deps ?? realTechDebtDeps(options.workspaceRootAbs);
				const scan = await deps.listSourceFiles();
				const all = sortFindings(scanMarkers(scan.files));
				const filter =
					args.only !== undefined && args.only.length > 0
						? new Set(
								args.only.map(
									(marker) =>
										`marker-${marker.toLowerCase()}`,
								),
							)
						: undefined;
				const findings =
					filter === undefined
						? all
						: all.filter((finding) => filter.has(finding.ruleId));
				return toolJson({
					filesScanned: scan.files.length,
					...findingsReport(findings, TECH_DEBT_MAX_REPORTED),
					coverage: {
						capped: scan.capped,
						maxFiles: TECH_DEBT_MAX_FILES,
						skippedTotal: scan.skipped.length,
						skipped: scan.skipped.slice(
							0,
							TECH_DEBT_MAX_SKIPPED_REPORTED,
						),
					},
				});
			},
		);
	},
});
