/**
 * security-secrets.tool.ts — the `security_secrets` tool: scan the project's
 * source for leaked secrets and return normalized findings + a per-severity
 * summary. Composes the r00012 finding helpers; the scan orchestrator's I/O
 * is injectable (real git+fs adapter by default), so the tool is testable.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

import type { ISecuritySecretsToolOptions } from '../contracts/interfaces/secrets.interface';
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

export const buildSecuritySecretsRegistration = (
	options: ISecuritySecretsToolOptions,
): IToolRegistration => ({
	id: 'security_secrets',
	summary:
		'Scan source for leaked secrets (keys, tokens, private keys) — offline, normalized findings.',
	tags: ['security', 'secrets'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_security_secrets`,
			{
				description:
					"Scan the project's source for leaked secrets (private keys, AWS/GitHub/Google/Slack/OpenAI tokens, ...) with high-precision offline rules. Returns normalized findings (severity critical..info, rule id, file:line, redacted match) + a per-severity summary. `scope`: 'changed' (default — git working-tree changes) or 'tracked' (all tracked files). Test/fixture files are skipped unless includeTests:true. No network.",
				inputSchema: z.object({
					scope: z.enum(['changed', 'tracked']).optional(),
					includeTests: z.boolean().optional(),
				}),
				outputSchema: z.object({
					tool: z.string(),
					scanned: z.number(),
					findings: z.array(FINDING),
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
			async (args: {
				scope?: 'changed' | 'tracked' | undefined;
				includeTests?: boolean | undefined;
			}) => {
				const deps =
					options.deps ?? realScanDeps(options.workspaceRootAbs);
				const { scanned, findings } = await runSecretScan(deps, {
					scope: args.scope ?? 'changed',
					includeTests: args.includeTests === true,
				});
				return toolJson({
					tool: 'secrets',
					scanned,
					findings,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
