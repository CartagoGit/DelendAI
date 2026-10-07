import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'git',
	package: '@delendai/git',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
	tags: ['git', 'changelog'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'git-read', 'git-write'],
	presets: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	// f00180 S2 / MAN-004 — per-tool permission map. Read-only tools
	// declare `git-read` only; write tools (`commit`, `push`) declare
	// `git-write` so a host can refuse them under a read-only grant.
	toolPermissions: {
		status: ['git-read'],
		changed: ['git-read'],
		diff: ['git-read'],
		log: ['git-read'],
		blame: ['git-read'],
		show: ['git-read'],
		worktree: ['git-read'],
		changelog: ['git-read'],
		commit: ['git-write'],
		push: ['git-write'],
	},
	tokenBudget: {
		staticBytes: 5_800,
		adaptiveActivationBytes: 950,
		typicalOutput: 1_400,
		caps: { hard: 6_800, warning: 6_200 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['git', 'changelog'],
});
