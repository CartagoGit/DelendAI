/**
 * i18n-check.tool.ts — `i18n_check`: flag missing keys + placeholder
 * mismatches across locale JSON files. Composes the r00012 finding helpers;
 * the reader is injectable, so the tool is testable.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

import type { II18nCheckToolOptions } from '../contracts/interfaces/i18n.interface';
import { checkLocales } from '../i18n/check-i18n';
import { realI18nDeps } from '../i18n/real-deps';

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

export const buildI18nCheckRegistration = (
	options: II18nCheckToolOptions,
): IToolRegistration => ({
	id: 'i18n_check',
	summary:
		'Flag missing keys + placeholder mismatches across locale JSON files. Offline.',
	tags: ['i18n', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_i18n_check`,
			{
				description:
					'Check locale JSON files for consistency: keys present in some locales but missing in others (missing-key, medium) and interpolation-placeholder mismatches for the same key (placeholder-mismatch, medium). Nested keys are flattened (a.b.c). Pass `localesDir` (default "locales"). Offline, read-only.',
				inputSchema: z.object({ localesDir: z.string().optional() }),
				outputSchema: z.object({
					localesDir: z.string(),
					locales: z.array(z.string()),
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
			async (args: { localesDir?: string | undefined }) => {
				const localesDir = args.localesDir ?? 'locales';
				const deps =
					options.deps ??
					realI18nDeps(options.workspaceRootAbs, localesDir);
				const locales = await deps.listLocales();
				const findings = checkLocales(locales);
				return toolJson({
					localesDir,
					locales: locales.map((locale) => locale.locale),
					findings,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
