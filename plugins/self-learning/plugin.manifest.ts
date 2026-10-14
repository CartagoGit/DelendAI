import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'self-learning',
	package: '@delendai/self-learning',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Per-project learning store: accumulates observations the runtime already writes and answers what this project has taught us.',
	tags: ['self-learning', 'observability'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'filesystem-write'],
	// Deliberately in NO preset. What it accumulates is cheap, but it is
	// still a file in somebody's repository: a project that has not asked
	// to be observed should not be.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['self-learning'],
});
