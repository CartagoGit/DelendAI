import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'diagram',
	package: '@delendai/diagram',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Diagram generator (mermaid, dot) from code structure.',
	tags: ['diagram', 'docs'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/database',
		'@delendai/proposals',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['diagram', 'docs'],
});
