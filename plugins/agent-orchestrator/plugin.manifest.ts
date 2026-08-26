import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

/**
 * Manifest for the `agent-orchestrator` plugin — the *workflow policy*
 * layer that sits on top of `auto-agent-selector` (which model) and
 * `auto-plugin-selector` (which plugins). This plugin decides *how*
 * the agent works:
 *
 *   - `single` — the orchestrator does all work alone
 *   - `linear` — one subagent per task; sequential
 *   - `swarm` — fan-out, parallel subagents
 *   - `auto`  — classify each task, route to the cheapest mode that
 *               can handle it (default in dogfooding)
 *
 * Always enforces:
 *
 *   - max tokens per agent / per subagent
 *   - max iterations per task
 *   - mid-task subagent rotation when a subordinate goes off-rails
 *     (token-exhausted, schema-failing, repeated-output, error-storm)
 */
export default definePluginManifest({
	id: 'agent-orchestrator',
	package: '@mcp-vertex/agent-orchestrator',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation.',
	tags: ['orchestrator', 'policy', 'workflow', 'subagent'],
	maturity: 'experimental',
	permissions: ['process'],
	presets: ['standard', 'swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['orchestrator', 'policy'],
});
