import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'quality',
	package: '@delendai/quality',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Quality gates: coverage, complexity, lint, type-check orchestration.',
	tags: ['quality', 'gates'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	// f00179 S2 — quality exposes 8 tools (run_quality, get_scopes,
	// get_rules, evidence_collect, plan_apply, etc.). Lint+typecheck
	// policy blobs are the bulk of the registration cost. Measured
	// 2026-08-25.
	tokenBudget: {
		staticBytes: 8_200,
		adaptiveActivationBytes: 1_400,
		typicalOutput: 2_200,
		caps: { hard: 9_800, warning: 9_000 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['quality', 'gates'],
});
