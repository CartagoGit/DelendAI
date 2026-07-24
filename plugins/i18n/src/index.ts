import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildI18nCheckRegistration } from './lib/tools/i18n-check.tool';

/**
 * i18n plugin. `i18n_check` flags cross-locale inconsistencies (missing keys,
 * interpolation-placeholder mismatches) across locale JSON files as normalized
 * findings. Offline, pure. Load with `mcp-vertex --plugins=i18n`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'i18n',
	version: '0.1.0',
	describe:
		'Internationalization hygiene: i18n_check flags missing keys and interpolation-placeholder mismatches across locale JSON files. Offline, pure.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildI18nCheckRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'i18n-usage',
					title: 'Internationalization hygiene',
					body: [
						'# Internationalization hygiene',
						'',
						`Tool: \`${ctx.namespacePrefix}_i18n_check\` — cross-locale consistency (offline).`,
						'',
						'- Flags keys present in some locales but missing in others (missing-key), and interpolation-placeholder mismatches for the same key (placeholder-mismatch).',
						'- Nested keys are flattened to `a.b.c`. Pass `localesDir` (default `locales`).',
						'- Offline and pure — no external tools, no network.',
					].join('\n'),
				},
			],
		};
	},
});
