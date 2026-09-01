import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { buildI18nCheckRegistration } from './lib/tools/i18n-check.tool';
import { buildI18nValidateRegistration } from './lib/tools/i18n-validate.tool';

/**
 * i18n plugin. `i18n_check` diffs key usage vs locale files; `i18n_validate`
 * validates interpolation / ICU consistency. Offline, pure. Load with
 * `mcp-vertex --plugins=i18n`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'i18n',
	version: '0.1.1',
	describe:
		'Internationalization hygiene: i18n_check diffs missing/unused keys and i18n_validate validates interpolation/ICU consistency across locale JSON files. Offline, pure.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildI18nCheckRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				buildI18nValidateRegistration({
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
						`Tools: \`${ctx.namespacePrefix}_i18n_check\` + \`${ctx.namespacePrefix}_i18n_validate\` — read-only locale hygiene checks.`,
						'',
						'- `i18n_check`: missing-key, unused-key, and simple interpolation-placeholder mismatches.',
						'- `i18n_validate`: ICU/select/plural placeholder mismatches, malformed ICU syntax, and extra-locale keys missing from the source locale.',
						'- Nested keys are flattened to `a.b.c`. Pass `localesDir` (default `locales`).',
						'- Offline and pure — no external tools, no network.',
					].join('\n'),
				},
			],
		};
	},
});
