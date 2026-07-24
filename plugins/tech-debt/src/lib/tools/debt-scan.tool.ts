/**
 * debt-scan.tool.ts — `debt_scan`: find tech-debt marker comments
 * (TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE) across the workspace and report
 * them as severity-ranked findings. Composes the r00012 finding helpers; the
 * reader is injectable, so the tool is testable. Offline, read-only.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	sortFindings,
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

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

/** Cap findings in the response; `total` still reports the true count. */
const MAX_REPORTED = 200;

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
				const files = await deps.listSourceFiles();
				const all = sortFindings(scanMarkers(files));
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
					filesScanned: files.length,
					total: findings.length,
					findings: findings.slice(0, MAX_REPORTED),
					truncated: findings.length > MAX_REPORTED,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
