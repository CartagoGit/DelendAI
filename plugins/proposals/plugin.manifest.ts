import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'proposals',
	package: '@mcp-vertex/proposals',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Proposals workflow + multi-agent (swarm) orchestration.',
	tags: ['proposals', 'swarm', 'orchestration'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'git-read',
		'git-write',
	],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/error-reporting',
		'@mcp-vertex/logs',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['proposals', 'swarm', 'orchestration'],
});
