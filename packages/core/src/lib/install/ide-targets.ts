import { join } from 'node:path';

import type { IMcpConfigKind } from './merge-config';

/** Where this target's config lives + how it shapes an stdio MCP server. */
export interface IIdeInstallTarget {
	readonly id: string;
	readonly label: string;
	readonly kind: IMcpConfigKind;
	/** VS Code requires an explicit `"type": "stdio"` on the server entry. */
	readonly stdioType?: boolean;
	readonly scope: 'project' | 'global';
	/** Absolute config path for the given environment. */
	readonly resolve: (ctx: IInstallEnv) => string | undefined;
	/**
	 * Paths whose existence means "this IDE is in use here" (used by detection
	 * so `init` only writes where it makes sense). The config file itself always
	 * counts; these are extra signals (the IDE's project/app dir).
	 */
	readonly signals: (ctx: IInstallEnv) => readonly string[];
}

export interface IInstallEnv {
	readonly projectDir: string;
	readonly home: string;
	readonly platform: NodeJS.Platform;
	readonly appData?: string | undefined;
	/** True when running in WSL (Linux userland under Windows). */
	readonly isWsl?: boolean | undefined;
}

const claudeDesktopPath = (ctx: IInstallEnv): string => {
	if (ctx.platform === 'darwin') {
		return join(ctx.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
	}
	if (ctx.platform === 'win32') {
		return join(ctx.appData ?? join(ctx.home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
	}
	return join(ctx.home, '.config', 'Claude', 'claude_desktop_config.json');
};

/** Every IDE/agent `init` knows how to configure. */
export const IDE_TARGETS: readonly IIdeInstallTarget[] = [
	{
		id: 'vscode',
		label: 'VS Code · Copilot',
		kind: 'servers',
		stdioType: true,
		scope: 'project',
		resolve: (c) => join(c.projectDir, '.vscode', 'mcp.json'),
		signals: (c) => [join(c.projectDir, '.vscode')],
	},
	{
		id: 'cursor',
		label: 'Cursor (project)',
		kind: 'mcpServers',
		scope: 'project',
		resolve: (c) => join(c.projectDir, '.cursor', 'mcp.json'),
		signals: (c) => [join(c.projectDir, '.cursor'), join(c.home, '.cursor')],
	},
	{
		id: 'cursor-global',
		label: 'Cursor (global)',
		kind: 'mcpServers',
		scope: 'global',
		resolve: (c) => join(c.home, '.cursor', 'mcp.json'),
		signals: (c) => [join(c.home, '.cursor')],
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		kind: 'mcpServers',
		scope: 'global',
		resolve: (c) => join(c.home, '.codeium', 'windsurf', 'mcp_config.json'),
		signals: (c) => [join(c.home, '.codeium', 'windsurf'), join(c.home, '.codeium')],
	},
	{
		id: 'claude-code',
		label: 'Claude Code',
		kind: 'mcpServers',
		scope: 'project',
		resolve: (c) => join(c.projectDir, '.mcp.json'),
		signals: (c) => [join(c.projectDir, '.mcp.json'), join(c.home, '.claude')],
	},
	{
		id: 'claude-desktop',
		label: 'Claude Desktop',
		kind: 'mcpServers',
		scope: 'global',
		resolve: claudeDesktopPath,
		signals: (c) => [claudeDesktopPath(c)],
	},
	{
		id: 'antigravity',
		label: 'Antigravity',
		kind: 'mcpServers',
		scope: 'global',
		resolve: (c) => join(c.home, '.gemini', 'config', 'mcp_config.json'),
		signals: (c) => [join(c.home, '.gemini', 'config'), join(c.home, '.gemini')],
	},
];

export const targetById = (id: string): IIdeInstallTarget | undefined =>
	IDE_TARGETS.find((t) => t.id === id);
