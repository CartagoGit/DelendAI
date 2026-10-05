import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'framework-knowledge',
	package: '@delendai/framework-knowledge',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Resolves what the project’s installed framework version allows, recommends and forbids, before an agent writes code.',
	tags: ['knowledge', 'frameworks', 'policy'],
	maturity: 'experimental',
	// The tools only read the manifest, the lockfile and the local
	// knowledge cache; nothing here writes outside the cache directory.
	permissions: ['filesystem-read'],
	// Deliberately in NO preset: adopting a framework rule is a decision
	// a project opts into, not a default.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: [],
});
