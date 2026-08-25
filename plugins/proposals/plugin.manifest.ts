import { definePluginManifest } from '@mcp-vertex/core/public';

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
	// f00179 S2 — proposals is the heaviest first-party plugin
	// (~30 tools: agent_lock, agent_worktree, auto_work, plan,
	// delegate, proposal_transition, etc.). Measured 2026-08-25.
	tokenBudget: {
		staticBytes: 12_400,
		adaptiveActivationBytes: 2_100,
		typicalOutput: 3_200,
		caps: { hard: 15_000, warning: 13_500 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/error-reporting',
		'@mcp-vertex/logs',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['proposals', 'swarm', 'orchestration'],
});
