/**
 * `tools/scripts/dev/api/resolve-mcp-spawn.ts` — resolve the
 * `(command, args)` pair to spawn the MCP server with, for the dev
 * preview only.
 *
 * Mirrors `extensions/vscode/src/extension.ts#resolveServerCommand` so
 * the browser preview behaves the same as the real extension would
 * inside VS Code:
 *
 *   1. Read `mcp-vertex.server.command` / `mcp-vertex.server.args` from
 *      `<cwd>/.vscode/settings.json` (the workspace's configuration).
 *   2. Fall back to `bun run mcp-vertex` (the canonical CLI launcher).
 *
 * The `args` field accepts either a JSON array (typed verbatim in
 * settings.json) or a space-separated string. Power users typically
 * prefer the array form; the string form is friendlier for the common
 * single-script case.
 *
 * Why not use the production extension code as-is? It depends on the
 * `vscode` runtime (`vscode.workspace.getConfiguration(...)`), which is
 * only available inside the VS Code extension host. The dev script is
 * a regular Bun process, so we read the settings file directly with
 * `Bun.file().json()`. Same contract, different reader.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface IMcpSpawn {
	readonly command: string;
	readonly args: readonly string[];
	readonly source: 'workspace-settings' | 'default';
}

const DEFAULTS: IMcpSpawn = {
	command: 'bun',
	args: ['run', 'mcp-vertex'],
	source: 'default',
};

const parseArgs = (raw: unknown): readonly string[] | undefined => {
	if (Array.isArray(raw) && raw.every((a) => typeof a === 'string')) {
		return raw as readonly string[];
	}
	if (typeof raw === 'string' && raw.trim().length > 0) {
		return raw.trim().split(/\s+/);
	}
	return undefined;
};

export const resolveMcpStdioSpawn = async (cwd: string): Promise<IMcpSpawn> => {
	const settingsPath = join(cwd, '.vscode', 'settings.json');
	if (!existsSync(settingsPath)) return DEFAULTS;

	const json = await Bun.file(settingsPath)
		.json()
		.catch(() => null);
	if (!json || typeof json !== 'object') return DEFAULTS;

	const section = json['mcp-vertex.server'];
	if (!section || typeof section !== 'object') return DEFAULTS;

	const cfg = section as Record<string, unknown>;
	const command =
		typeof cfg.command === 'string' && cfg.command.trim().length > 0
			? cfg.command
			: DEFAULTS.command;
	const args = parseArgs(cfg.args) ?? DEFAULTS.args;
	return { command, args, source: 'workspace-settings' };
};
