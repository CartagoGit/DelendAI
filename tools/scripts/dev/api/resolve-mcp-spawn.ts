/**
 * `tools/scripts/dev/api/resolve-mcp-spawn.ts` — resolve the
 * `(command, args)` pair to spawn the MCP server with, for the dev
 * preview only.
 *
 * Mirrors `extensions/vscode/src/extension.ts#resolveServerCommand` so
 * the browser preview behaves the same as the real extension would
 * inside VS Code:
 *
 *   1. Read the canonical `servers.mcp-vertex` declaration from
 *      `<cwd>/.vscode/mcp.json`.
 *   2. Fall back to the legacy `mcp-vertex.server` override in
 *      `<cwd>/.vscode/settings.json`, then to the CLI launcher.
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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IMcpSpawn {
	readonly command: string;
	readonly args: readonly string[];
	readonly source:
		| 'workspace-settings'
		| 'workspace-mcp'
		| 'workspace-local'
		| 'default';
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

const parseJsonc = async (
	path: string,
): Promise<Record<string, unknown> | null> => {
	if (!existsSync(path)) return null;
	const raw = await readFile(path, 'utf8').catch(() => '');
	const cleaned = raw
		.replace(/^\uFEFF/, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')
		.replace(/,(\s*[}\]])/g, '$1');
	try {
		const parsed = JSON.parse(cleaned) as unknown;
		return parsed !== null && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
};

const expandWorkspace = (value: string, cwd: string): string =>
	value.replaceAll('${workspaceFolder}', cwd);

const spawnFromSection = (
	raw: unknown,
	cwd: string,
	source: IMcpSpawn['source'],
): IMcpSpawn | null => {
	if (raw === null || typeof raw !== 'object') return null;
	const cfg = raw as Record<string, unknown>;
	if (typeof cfg.command !== 'string' || cfg.command.trim().length === 0)
		return null;
	const args = parseArgs(cfg.args) ?? [];
	return {
		command: expandWorkspace(cfg.command.trim(), cwd),
		args: args.map((arg) => expandWorkspace(arg, cwd)),
		source,
	};
};

export const resolveMcpStdioSpawn = async (cwd: string): Promise<IMcpSpawn> => {
	// VS Code's canonical MCP declaration lives in `.vscode/mcp.json`.
	// The old resolver ignored it and fell through to `bun run mcp-vertex`,
	// which is not a script in this repository. That made a correctly
	// configured preview wait for the dashboard timeout on every load.
	const mcp = await parseJsonc(join(cwd, '.vscode', 'mcp.json'));
	const servers = mcp?.servers;
	const declared =
		servers !== null && typeof servers === 'object'
			? (servers as Record<string, unknown>)['mcp-vertex']
			: undefined;
	const canonical = spawnFromSection(declared, cwd, 'workspace-mcp');
	if (canonical) {
		// This repository intentionally declares the future published CLI in
		// `.vscode/mcp.json`. During local development that package may not exist
		// on npm yet, while the current host entrypoint is available in-tree.
		// Prefer the local server only for that exact self-host declaration;
		// consumer projects and custom commands keep their configured process.
		const localHost = join(
			cwd,
			'tools',
			'scripts',
			'host',
			'host-server.script.ts',
		);
		if (
			existsSync(localHost) &&
			canonical.command === 'bunx' &&
			canonical.args.includes('@delendai/cli')
		) {
			const config = join(cwd, 'mcp-vertex.config.json');
			return {
				command: 'bun',
				args: [
					localHost,
					`--workspace=${cwd}`,
					...(existsSync(config) ? [`--config=${config}`] : []),
				],
				source: 'workspace-local',
			};
		}
		return canonical;
	}

	const settings = await parseJsonc(join(cwd, '.vscode', 'settings.json'));
	return (
		spawnFromSection(
			settings?.['mcp-vertex.server'],
			cwd,
			'workspace-settings',
		) ?? DEFAULTS
	);
};
