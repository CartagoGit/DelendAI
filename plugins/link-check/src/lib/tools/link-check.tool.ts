/**
 * link-check.tool.ts — `link_check`: verify markdown relative-link and anchor
 * integrity across the workspace. Composes the r00012 finding helpers; the
 * reader is injectable, so the tool is testable. Offline (external links are
 * never fetched), read-only.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	sortFindings,
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';

import type { ILinkCheckToolOptions } from '../contracts/interfaces/link-check.interface';
import { checkLinks } from '../link-check/check-links';
import { realLinkScanDeps } from '../link-check/real-deps';

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

export const buildLinkCheckRegistration = (
	options: ILinkCheckToolOptions,
): IToolRegistration => ({
	id: 'link_check',
	summary:
		'Verify markdown relative-link + anchor integrity across the workspace. Offline (external links never fetched).',
	tags: ['docs', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_link_check`,
			{
				description:
					'Check markdown links across the workspace: relative targets that do not exist (broken-link, high), `#anchor` fragments with no matching heading (broken-anchor, medium), and empty `[text]()` targets (empty-link, low). Anchor slugs use GitHub rules. External (http/mailto/…) links are never fetched. Skips node_modules, dist, build, .cache, .git. Offline, read-only.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					docsScanned: z.number(),
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
			async () => {
				const deps =
					options.deps ?? realLinkScanDeps(options.workspaceRootAbs);
				const [docs, knownPaths] = await Promise.all([
					deps.listDocs(),
					deps.listKnownPaths(),
				]);
				const findings = sortFindings(checkLinks(docs, knownPaths));
				return toolJson({
					docsScanned: docs.length,
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
