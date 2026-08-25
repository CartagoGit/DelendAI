import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'container',
	package: '@mcp-vertex/container',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Container inspection + lint (docker ps/images, k8s, Dockerfile rules).',
	tags: ['container', 'docker', 'kubernetes'],
	maturity: 'stable',
	permissions: ['container', 'process'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core'],
	capabilities: ['container', 'docker', 'kubernetes'],
});
