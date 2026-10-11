import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'execution-env',
	package: '@delendai/execution-env',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Execution environments: one contract and registry for running commands locally, in Docker, Docker Compose, over SSH or inside an existing container.',
	tags: ['execution', 'docker', 'ssh'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'filesystem-write', 'process', 'env-read'],
	// In no preset: running somewhere other than this machine is a
	// choice a project makes in its configuration, not a default.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['execution-env'],
});
