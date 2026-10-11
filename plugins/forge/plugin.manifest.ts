import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'forge',
	package: '@delendai/forge',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Forge (GitHub/GitLab) wrappers — PRs, CI, issues.',
	tags: ['forge', 'git', 'ci'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'process',
		'network',
		'forge-read',
		'forge-write',
	],
	presets: ['swarm', 'full', 'dogfood'],
	// f00180 S2 / MAN-004 — per-tool permission map. `network` is
	// pinned only on the tools that actually call the GH API
	// (`search_code`, `pr_create`, `issue_create`); the rest are
	// pure forge-read/write so a host can grant read-only access
	// without surfacing network in the prompt.
	toolPermissions: {
		pr_list: ['forge-read', 'network'],
		pr_show: ['forge-read', 'network'],
		ci_status: ['forge-read', 'network'],
		issue_list: ['forge-read', 'network'],
		issue_show: ['forge-read', 'network'],
		release: ['forge-read', 'forge-write', 'network'],
		search_code: ['forge-read', 'network'],
		pr_create: ['forge-write', 'network'],
		pr_comment: ['forge-write', 'network'],
		issue_create: ['forge-write', 'network'],
	},
	tokenBudget: {
		staticBytes: 6_800,
		adaptiveActivationBytes: 1_200,
		typicalOutput: 1_700,
		caps: { hard: 8_200, warning: 7_400 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['forge', 'git', 'ci'],
});
