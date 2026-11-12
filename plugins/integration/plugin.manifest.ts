import { definePluginManifest } from '@delendai/core/public';

const STATIC_BYTES = 120;
const HARD_CAP_BYTES = 400;
const WARNING_CAP_BYTES = 300;

export default definePluginManifest({
	id: 'integration',
	package: '@delendai/integration',
	version: '0.3.0',
	visibility: 'public',
	summary:
		'The pull request flow proven on real GitHub: a rehearsal of every case and production failure, with a report of what the forge did.',
	tags: ['integration', 'pull-request', 'rehearsal'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	// In no preset: a project opts in with its own validations.
	presets: ['everything'],
	tokenBudget: {
		staticBytes: STATIC_BYTES,
		caps: { hard: HARD_CAP_BYTES, warning: WARNING_CAP_BYTES },
		measuredAt: '2026-11-12',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['integration'],
});
