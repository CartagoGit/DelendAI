import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'issues-triage',
	package: '@mcp-vertex/issues-triage',
	version: '0.1.0',
	visibility: 'private',
	summary:
		'INTERNAL-ONLY issue triage bot for the mcp-vertex repository: reads GitHub issues, classifies them mechanically, drafts fix proposals and replies automatically with a machine-disclosure notice. Never published to npm.',
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
		'@mcp-vertex/core',
		'@mcp-vertex/proposals',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['github', 'issues', 'triage', 'bot', 'internal'],
});
