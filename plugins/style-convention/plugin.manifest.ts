import { definePluginManifest } from '@delendai/core/public';

import { STYLE_CONVENTION_TOKEN_BUDGET } from './src/lib/contracts/constants/token-budget.constant';

export default definePluginManifest({
	id: 'style-convention',
	package: '@delendai/style-convention',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'The style surface: who may define a selector, what a change to it reaches, and whether a hard-coded value already has a design token.',
	tags: ['styles', 'scss', 'design-tokens'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	toolPermissions: {
		style_profile: ['filesystem-read'],
		style_impact: ['filesystem-read'],
		style_check: ['filesystem-read'],
	},
	// In no preset: a project opts in by declaring where its styles are.
	presets: [],
	tokenBudget: STYLE_CONVENTION_TOKEN_BUDGET,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['styles', 'design-tokens'],
});
