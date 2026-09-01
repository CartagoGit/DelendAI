import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'skills-pack',
	package: '@mcp-vertex/skills-pack',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Curated skill pack (debugging, perf, pr-review, security, incident, migration).',
	tags: ['skills'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core'],
	capabilities: ['skills'],
});
