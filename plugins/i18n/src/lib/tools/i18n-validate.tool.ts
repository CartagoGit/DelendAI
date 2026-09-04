import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	resolveWorkspaceContained,
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';

import type { II18nValidateToolOptions } from '../contracts/interfaces/i18n.interface';
import { realI18nDeps } from '../i18n/real-deps';
import { validateInterpolation } from '../validate/validate-interpolation';

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

export const I18nValidateOutputSchema = z.object({
	localesDir: z.string(),
	sourceLocale: z.string(),
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
});

export const buildI18nValidateRegistration = (
	options: II18nValidateToolOptions,
): IToolRegistration => ({
	id: 'i18n_validate',
	summary:
		'Validate interpolation and ICU consistency across locale JSON files. Offline.',
	tags: ['i18n', 'quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_i18n_validate`,
			{
				description:
					'Validate locale JSON messages for interpolation and ICU consistency: placeholder mismatches across locales (placeholder-mismatch, medium), malformed ICU/select/plural syntax (malformed-icu, high), and locale keys missing from the source locale (extra-locale, low). Pass `localesDir` (default "locales"). Offline, read-only.',
				inputSchema: z.object({ localesDir: z.string().optional() }),
				outputSchema: I18nValidateOutputSchema,
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
				const findings = validateInterpolation(locales);
				const sourceLocale =
					locales
						.map((locale) => locale.locale)
						.sort((a, b) => a.localeCompare(b))
						.find((locale) => locale === 'en') ??
					locales
						.map((locale) => locale.locale)
						.sort((a, b) => a.localeCompare(b))[0] ??
					'none';
				return toolJson({
					localesDir,
					sourceLocale,
					locales: locales.map((locale) => locale.locale),
					findings,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
