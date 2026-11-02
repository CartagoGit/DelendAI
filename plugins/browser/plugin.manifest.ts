import { definePluginManifest } from '@delendai/core/public';

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
	tokenBudget: {
		staticBytes: 5_945,
		caps: { hard: 6_840, warning: 6_250 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', 'playwright'],
	capabilities: ['browser', 'automation'],
});
