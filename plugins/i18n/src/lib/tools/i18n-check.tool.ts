/**
 * i18n-check.tool.ts — `i18n_check`: flag missing keys + placeholder
 * mismatches across locale JSON files. Composes the r00012 finding helpers;
 * the reader is injectable, so the tool is testable.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	resolveWorkspaceContained,
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';

import type { II18nCheckToolOptions } from '../contracts/interfaces/i18n.interface';
import { extractUsedKeys } from '../keys/extract-used-keys';
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
		'Flag missing keys, unused keys, and placeholder mismatches across locale JSON files. Offline.',
	tags: ['i18n', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_i18n_check`,
			{
				description:
					'Check locale JSON files for consistency: keys present in some locales but missing in others (missing-key, medium), locale keys never referenced by the scanned source files (unused-key, low), and interpolation-placeholder mismatches for the same key (placeholder-mismatch, medium). Nested keys are flattened (a.b.c). Pass `localesDir` (default "locales"). Offline, read-only.',
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
				let deps = options.deps;
				if (deps === undefined) {
					const contained = resolveWorkspaceContained(
						options.workspaceRootAbs,
						localesDir,
					);
					if (!contained.ok) {
						return toolError(
							`localesDir "${localesDir}" is not allowed`,
							contained.reason ??
								'Path must stay inside the workspace root.',
						);
					}
					deps = realI18nDeps(
						options.workspaceRootAbs,
						contained.rel,
					);
				}
				const locales = await deps.listLocales();
				const sourceFiles = (await deps.listSourceFiles?.()) ?? [];
				const usedKeys =
					sourceFiles.length > 0
						? extractUsedKeys(sourceFiles)
						: undefined;
				const findings = checkLocales(locales, {
					...(usedKeys !== undefined ? { usedKeys } : {}),
				});
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
