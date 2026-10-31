import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'error-reporting',
	package: '@delendai/error-reporting',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Automatic delendai error reporting, on by default and announced at every start: opens de-duplicated GitHub issues for delendai-internal failures only; one config line turns it off.',
	tags: ['error-reporting', 'github', 'issues'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'network',
		'forge-write',
	],
	presets: ['standard', 'swarm', 'full', 'dogfood'],
	startupActivation: true,
	// Per-tool permissions: each tool asks for what it does. Both tools
	// read local state only; the reporter that opens issues is not a tool.
	// report_status used to ask for network and forge-write, and
	// diagnose_log, unlisted, inherited the plugin's whole set.
	toolPermissions: {
		report_status: ['filesystem-read'],
		diagnose_log: ['filesystem-read'],
	},
	tokenBudget: {
		staticBytes: 3_500,
		adaptiveActivationBytes: 600,
		typicalOutput: 900,
		caps: { hard: 4_200, warning: 3_800 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['error-reporting', 'github', 'issues'],
});
