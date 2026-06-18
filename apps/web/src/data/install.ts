// Install matrix data: how to run @mcp-vertex with each package manager, and
// where the MCP config lives for each IDE/agent. Verified against each tool's
// 2026 docs. The published package name is the single source of truth here.

export const PACKAGE = '@mcp-vertex/core';
export const SERVER_NAME = 'mcp-vertex';

export interface IPackageManager {
	readonly id: string;
	readonly label: string;
	/** The executable that runs the published package (stdio MCP server). */
	readonly command: string;
	/** Args before any `--preset` flag. */
	readonly args: readonly string[];
	/** One-line install-it-globally hint shown above the config. */
	readonly run: string;
	readonly note?: string;
}

export const packageManagers: readonly IPackageManager[] = [
	{ id: 'npm', label: 'npm', command: 'npx', args: ['-y', PACKAGE], run: `npx -y ${PACKAGE} --check` },
	{ id: 'pnpm', label: 'pnpm', command: 'pnpm', args: ['dlx', PACKAGE], run: `pnpm dlx ${PACKAGE} --check` },
	{ id: 'yarn', label: 'yarn', command: 'yarn', args: ['dlx', PACKAGE], run: `yarn dlx ${PACKAGE} --check` },
	{
		id: 'bun',
		label: 'bun',
		command: 'bunx',
		args: [PACKAGE],
		run: `bunx ${PACKAGE} --check`,
		note: 'mcp-vertex itself is built with bun.',
	},
	{ id: 'deno', label: 'deno', command: 'deno', args: ['run', '-A', `npm:${PACKAGE}`], run: `deno run -A npm:${PACKAGE} --check` },
];

/** The JSON key + shape an IDE expects for an stdio MCP server. */
export type IMcpConfigKind = 'mcpServers' | 'servers' | 'context_servers';

export interface IIdeTarget {
	readonly id: string;
	readonly label: string;
	/** Where the config file lives. */
	readonly file: string;
	/** Scope hint: project vs global. */
	readonly scope: string;
	readonly kind: IMcpConfigKind;
	/** VS Code requires an explicit `"type": "stdio"`. */
	readonly stdioType?: boolean;
	readonly note?: string;
}

export const ideTargets: readonly IIdeTarget[] = [
	{ id: 'vscode', label: 'VS Code · Copilot', file: '.vscode/mcp.json', scope: 'project', kind: 'servers', stdioType: true },
	{ id: 'cursor', label: 'Cursor', file: '.cursor/mcp.json  ·  ~/.cursor/mcp.json', scope: 'project / global', kind: 'mcpServers' },
	{ id: 'windsurf', label: 'Windsurf', file: '~/.codeium/windsurf/mcp_config.json', scope: 'global', kind: 'mcpServers' },
	{ id: 'claude-code', label: 'Claude Code', file: '.mcp.json  ·  claude mcp add', scope: 'project', kind: 'mcpServers' },
	{ id: 'claude-desktop', label: 'Claude Desktop', file: 'claude_desktop_config.json', scope: 'global', kind: 'mcpServers' },
	{ id: 'antigravity', label: 'Antigravity', file: '~/.gemini/config/mcp_config.json', scope: 'global', kind: 'mcpServers' },
	{ id: 'zed', label: 'Zed', file: 'settings.json', scope: 'global', kind: 'context_servers' },
];

/** Build the MCP config JSON snippet for one IDE + package manager. */
export const renderConfig = (ide: IIdeTarget, pm: IPackageManager, preset = 'standard'): string => {
	const args = [...pm.args, `--preset=${preset}`];
	const server: Record<string, unknown> = { command: pm.command, args };
	if (ide.stdioType) Object.assign(server, { type: 'stdio', command: pm.command, args });
	const inner =
		ide.kind === 'context_servers'
			? { [SERVER_NAME]: { command: pm.command, args } }
			: { [SERVER_NAME]: ide.stdioType ? { type: 'stdio', command: pm.command, args } : { command: pm.command, args } };
	return JSON.stringify({ [ide.kind]: inner }, null, 2);
};
