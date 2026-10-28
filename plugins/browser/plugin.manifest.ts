import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'browser',
	package: '@delendai/browser',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Headless browser automation tools; they need Playwright installed and answer with an install hint without it.',
	tags: ['browser', 'automation'],
	// Without a detected Playwright no page can be opened.
	maturity: 'experimental',
	permissions: ['filesystem-write', 'process', 'network', 'browser'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'playwright'],
	capabilities: ['browser', 'automation'],
});
