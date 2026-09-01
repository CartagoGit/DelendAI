import { definePluginManifest } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'issues',
	package: '@mcp-vertex/issues',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Issue tracker (GitHub) integration — list/fetch/analyze/ingest/resolve.',
	tags: ['issues', 'forge', 'triage'],
	maturity: 'beta',
	permissions: ['forge-read', 'forge-write', 'network'],
	presets: ['full'],
	// f00180 S2 / MAN-004 — per-tool permission map. Read tools
	// declare `forge-read` + `network`; write tools add `forge-write`.
	// `setup_github` is a one-shot credential bootstrap tool — it
	// needs full write + network to register the host's credentials.
	toolPermissions: {
		issues_list: ['forge-read', 'network'],
		issues_fetch: ['forge-read', 'network'],
		issues_analyze: ['forge-read'],
		issues_ingest: ['forge-read', 'network'],
		issues_resolve: ['forge-write', 'network'],
		setup_github: ['forge-write', 'network', 'secrets'],
	},
	tokenBudget: {
		staticBytes: 4_900,
		adaptiveActivationBytes: 880,
		typicalOutput: 1_300,
		caps: { hard: 5_900, warning: 5_300 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['issues', 'forge', 'triage'],
});
