/**
 * cli-guide.ts — DATA for the CLI usage guide page (f00053 S5).
 *
 * Documents how to drive the `mcpv` / `@mcp-vertex/core` CLI: the global
 * flags, the per-plugin command groups, and the common workflows. It is
 * DATA only (open/closed: documenting a new command group is a new entry,
 * never a code change), and the plugin command groups are DERIVED from
 * the canonical plugin catalog (S1) so the CLI guide and the /plugins
 * page never describe a plugin differently.
 */
import { PACKAGE, SERVER_NAME } from '#DATA/install';
import { PLUGIN_CATALOG, PLUGIN_SLUGS } from '#DATA/plugin-catalog';

export interface ICliFlag {
	/** The flag as typed (e.g. `--plugins=<a,b>`). */
	readonly flag: string;
	/** One-line description. */
	readonly summary: string;
	/** Optional concrete example. */
	readonly example?: string;
}

export interface ICliCommandGroup {
	/** Group id (the plugin slug, or `core`/`doctor`). */
	readonly id: string;
	/** Human title. */
	readonly title: string;
	/** What the group's subcommands do. */
	readonly summary: string;
}

export interface ICliWorkflow {
	readonly title: string;
	readonly steps: readonly string[];
}

export interface ICliGuide {
	readonly binary: string;
	readonly serverName: string;
	readonly globalFlags: readonly ICliFlag[];
	readonly commandGroups: readonly ICliCommandGroup[];
	readonly workflows: readonly ICliWorkflow[];
}

const GLOBAL_FLAGS: readonly ICliFlag[] = [
	{
		flag: '--plugins=<a,b,…>',
		summary:
			'Load specific plugins (comma-separated or a repeated flag). The core ships no domain tools on its own.',
		example: `npx -y ${PACKAGE} --plugins=git`,
	},
	{
		flag: '--preset=<name>',
		summary:
			'Load a curated plugin set (e.g. standard, swarm). Merges with any explicit --plugins.',
		example: `npx -y ${PACKAGE} --preset=swarm`,
	},
	{
		flag: '--exclude-plugins=<a,b>',
		summary:
			'Subtract plugins from the resolved set (after preset/plugins).',
	},
	{
		flag: '--workspace=<path>',
		summary: 'Absolute workspace root the tools operate on (default: cwd).',
	},
	{
		flag: '--prefix=<name>',
		summary: `Namespace the core tools under a custom prefix (default: ${SERVER_NAME}).`,
	},
	{
		flag: '--config=<path>',
		summary:
			'Path to the mcp-vertex.config.json (autodetected at the workspace otherwise).',
	},
	{
		flag: '--agent-worktree[=true|false]',
		summary:
			'Host-scoped gate for the agent_worktree tool (default off). A bare flag means true.',
	},
];

// Command groups: the 16 plugins (title/summary reused from the canonical
// catalog) plus the always-present core meta-tools and the doctor.
const PLUGIN_COMMAND_GROUPS: readonly ICliCommandGroup[] = PLUGIN_SLUGS.map(
	(slug) => ({
		id: slug,
		title: PLUGIN_CATALOG[slug].displayName,
		summary: PLUGIN_CATALOG[slug].purpose,
	}),
);

const CORE_COMMAND_GROUPS: readonly ICliCommandGroup[] = [
	{
		id: 'core',
		title: 'Core',
		summary:
			'Always-present meta-tools: project overview, knowledge, status, metrics, scaffold and the analyze/create bootstrap.',
	},
	{
		id: 'doctor',
		title: 'Doctor',
		summary:
			'Diagnose the host: resolved config, loaded plugins, paths and common misconfigurations.',
	},
];

const WORKFLOWS: readonly ICliWorkflow[] = [
	{
		title: 'Start a server for an MCP client',
		steps: [
			`Run ${SERVER_NAME} with a preset or explicit plugins: npx -y ${PACKAGE} --preset=standard`,
			'Point your MCP client (VS Code, Cursor, Claude, …) at that command — see the Install page for per-IDE config.',
			`Call the overview tool first to see what is loaded.`,
		],
	},
	{
		title: 'Run with a single plugin',
		steps: [
			`npx -y ${PACKAGE} --plugins=rules`,
			'Only that plugin’s tools are exposed; the core meta-tools are always present.',
		],
	},
	{
		title: 'Bootstrap a new project',
		steps: [
			`npx -y ${PACKAGE} init`,
			'Answer the prompts; the CLI writes the config and the IDE wiring.',
			`Verify it runs: npx -y ${PACKAGE} --check`,
		],
	},
	{
		title: 'Diagnose a broken setup',
		steps: [
			`Run the doctor: npx -y ${PACKAGE} doctor`,
			'Check the reported config path, loaded plugins and any flagged issues.',
		],
	},
];

export const CLI_GUIDE: ICliGuide = {
	binary: 'mcpv',
	serverName: SERVER_NAME,
	globalFlags: GLOBAL_FLAGS,
	commandGroups: [...PLUGIN_COMMAND_GROUPS, ...CORE_COMMAND_GROUPS],
	workflows: WORKFLOWS,
};
