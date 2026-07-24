/**
 * security-audit.tool.ts — the `security_audit` tool: run every scanner
 * (leaked-secrets + dependency CVEs + dependency licenses) and return ONE
 * ranked backlog (most-severe first) with a per-severity summary and the list
 * of scanners that were skipped. The self-improvement flywheel: one call →
 * the highest-value posture fix for this project.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toScanResult, toolJson } from '@mcp-vertex/core/public';
import {
	realLicenseDeps,
	runDepsAudit,
	scanLicenses,
} from '@mcp-vertex/deps/public';

import type { ISecuritySecretsToolOptions } from '../contracts/interfaces/secrets.interface';
import { runSecurityAudit } from '../audit/run-audit';
import { realScanDeps } from '../secrets/real-deps';
import { runSecretScan } from '../secrets/run-scan';

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

export const buildSecurityAuditRegistration = (
	options: ISecuritySecretsToolOptions,
): IToolRegistration => ({
	id: 'security_audit',
	summary:
		'Run every scanner (secrets + dependency CVEs + licenses) and return one ranked backlog.',
	tags: ['security', 'audit', 'network'],
	effects: ['network'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_security_audit`,
			{
				description:
					'Run all scanners against the project — leaked-secrets (offline), dependency CVEs (bun audit, network) and dependency licenses (offline) — and return ONE ranked backlog: findings sorted most-severe first, a per-severity summary, the scanners that ran, and any that were skipped (with a hint). The self-audit flywheel for project posture. Scanners degrade gracefully when a tool is missing.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					scanned: z.number(),
					tools: z.array(z.string()),
					worst: z.string(),
					summary: z.object({
						critical: z.number(),
						high: z.number(),
						medium: z.number(),
						low: z.number(),
						info: z.number(),
					}),
					findings: z.array(FINDING),
					skipped: z.array(
						z.object({
							tool: z.string(),
							note: z.string().optional(),
						}),
					),
				}),
			},
			async () => {
				const workspace = options.workspaceRootAbs;
				// Run the secret scan up front so we can report the file count.
				const secrets = await runSecretScan(
					options.deps ?? realScanDeps(workspace),
					{ scope: 'tracked', includeTests: false },
				);
				const aggregate = await runSecurityAudit([
					async () => toScanResult('secrets', secrets.findings),
					() => runDepsAudit(workspace),
					async () =>
						toScanResult(
							'licenses',
							await scanLicenses(
								realLicenseDeps(workspace, 'package.json'),
							),
						),
				]);
				return toolJson({
					scanned: secrets.scanned,
					tools: aggregate.tools,
					worst: aggregate.worst,
					summary: aggregate.summary,
					findings: aggregate.findings,
					skipped: aggregate.skipped,
				});
			},
		);
	},
});
