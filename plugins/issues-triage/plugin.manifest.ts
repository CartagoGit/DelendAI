import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'issues-triage',
	package: '@delendai/issues-triage',
	version: '0.1.0',
	visibility: 'private',
	summary:
		'INTERNAL-ONLY issue triage bot for the delendai repository: reads GitHub issues, classifies them mechanically, drafts fix proposals and replies automatically with a machine-disclosure notice. Never published to npm.',
	tags: ['github', 'issues', 'triage', 'bot', 'internal'],
	maturity: 'experimental',
	permissions: [
		'forge-read',
		'forge-write',
		'filesystem-read',
		'filesystem-write',
		'network',
	],
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/proposals',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['github', 'issues', 'triage', 'bot', 'internal'],
});
