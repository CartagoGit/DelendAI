import { definePluginManifest } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'git',
	package: '@mcp-vertex/git',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
	tags: ['git', 'changelog'],
	maturity: 'stable',
	permissions: ['git-read', 'git-write'],
	presets: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	// f00179 S2 — real token budget for the 9 git tools (status, log,
	// diff, pr.list, pr.view, branch.*, tag.*, worktree.*). Measured
	// 2026-08-25 against the live plugin's tools/list payload.
	tokenBudget: {
		staticBytes: 5_800,
		adaptiveActivationBytes: 950,
		typicalOutput: 1_400,
		caps: { hard: 6_800, warning: 6_200 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['git', 'changelog'],
});
