/**
 * security-audit.tool.ts — the `security_audit` tool: run every security
 * scanner (leaked-secrets + dependency CVEs) and return ONE ranked backlog
 * (most-severe first) with a per-severity summary and the list of scanners
 * that were skipped. The self-improvement flywheel: one call → the highest-
 * value security fix for this project.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';
import { runDepsAudit } from '@mcp-vertex/deps/public';

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
		'Run every security scanner (secrets + dependency CVEs) and return one ranked backlog.',
	tags: ['security', 'audit', 'network'],
	effects: ['network'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_security_audit`,
			{
				description:
					'Run all security scanners against the project — leaked-secrets (offline) + dependency CVEs (bun audit, network) — and return ONE ranked backlog: findings sorted most-severe first, a per-severity summary, the scanners that ran, and any that were skipped (with a hint). The self-audit flywheel for security posture. Scanners degrade gracefully when a tool is missing.',
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
				const { aggregate, scanned } = await runSecurityAudit(
					() =>
						runSecretScan(options.deps ?? realScanDeps(workspace), {
							scope: 'tracked',
							includeTests: false,
						}),
					() => runDepsAudit(workspace),
				);
				return toolJson({
					scanned,
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
