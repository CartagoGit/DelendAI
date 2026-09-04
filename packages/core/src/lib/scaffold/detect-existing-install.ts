/**
 * detect-existing-install.ts — x00201 S2.
 *
 * `IScaffoldHostOptions.existingMcpVertex` / `mcpServerName` (x00200 S2,
 * x00201 S1) are correct once known, but nothing ever told the caller to
 * pass them: a fresh LLM adopting mcp-vertex into a project that already
 * has a working (or partial, or stale) install has no way to know it
 * should set `existingMcpVertex: true`, let alone what the project's real
 * MCP server key is. This module detects both from the workspace itself,
 * so `buildScaffoldReport` (the `<prefix>_scaffold` tool / `create_project`)
 * can default to the right behaviour without requiring the caller to
 * already know the internals.
 *
 * Pure parsing is separated from the async I/O that reads the workspace,
 * matching the rest of this directory's testing idiom (e.g.
 * `checkGithubAgentFile` in agent-redirector-contract.script.ts): the
 * parser is unit-tested with fixture strings, the orchestrator is
 * integration-tested against a real temp directory.
 */
import { readFile, stat } from 'node:fs/promises';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IExistingMcpVertexInstall } from '../contracts/interfaces/existing-mcp-vertex-install.interface';

export type { IExistingMcpVertexInstall } from '../contracts/interfaces/existing-mcp-vertex-install.interface';

interface IMcpServerLaunchShape {
	readonly command?: unknown;
	readonly args?: unknown;
}

/** Substrings that identify an mcp-vertex launch command, wherever they appear in `command` or `args`. */
const MCP_VERTEX_LAUNCH_SIGNATURES: readonly string[] = [
	'@delendai/cli',
	'mcpv',
	'host-server.script.ts',
	'host-server.ts',
];

const asArgv = (entry: IMcpServerLaunchShape): readonly string[] => {
	const command = typeof entry.command === 'string' ? [entry.command] : [];
	const args = Array.isArray(entry.args)
		? entry.args.filter((a): a is string => typeof a === 'string')
		: [];
	return [...command, ...args];
};

/** True when a server entry's command/args shape matches a known mcp-vertex launch. */
export const isMcpVertexLaunchShape = (entry: IMcpServerLaunchShape): boolean =>
	asArgv(entry).some((token) =>
		MCP_VERTEX_LAUNCH_SIGNATURES.some((sig) => token.includes(sig)),
	);

/**
 * Parses the raw text of an editor MCP config file (`.vscode/mcp.json`'s
 * `{ servers: {...} }` shape, or `.mcp.json`'s `{ mcpServers: {...} }`
 * shape — both exist in the wild; mcp-vertex's own repo uses the second)
 * and returns the key of the first server entry whose launch shape
 * matches mcp-vertex. Returns `undefined` on unparsable JSON or no match,
 * never throws — a malformed config is the target project's problem, not
 * a reason to crash detection.
 */
export const findMcpVertexServerName = (
	jsonText: string,
): string | undefined => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return undefined;
	}
	if (typeof parsed !== 'object' || parsed === null) return undefined;
	const record = parsed as Record<string, unknown>;
	const servers = record.servers ?? record.mcpServers;
	if (typeof servers !== 'object' || servers === null) return undefined;
	for (const [name, entry] of Object.entries(
		servers as Record<string, unknown>,
	)) {
		if (typeof entry !== 'object' || entry === null) continue;
		if (isMcpVertexLaunchShape(entry as IMcpServerLaunchShape)) return name;
	}
	return undefined;
};

const readIfExists = async (absPath: string): Promise<string | undefined> => {
	try {
		return await readFile(absPath, 'utf8');
	} catch {
		return undefined;
	}
};

const fileExists = async (absPath: string): Promise<boolean> => {
	try {
		await stat(absPath);
		return true;
	} catch {
		return false;
	}
};

/** Editor config files checked, in priority order — the first mcp-vertex-shaped match wins. */
const MCP_CONFIG_CANDIDATES: readonly string[] = [
	'.vscode/mcp.json',
	'.mcp.json',
];

/**
 * Detects whether `workspace` already has an mcp-vertex install (config,
 * a registered server, or both) and — when discoverable — the server's
 * real registration key. Never throws: a workspace with no prior install
 * (the common greenfield case) resolves to
 * `{ existingMcpVertex: false }`, same as passing no option today.
 */
export const detectExistingMcpVertexInstall = async (
	workspace: IWorkspacePathProvider,
): Promise<IExistingMcpVertexInstall> => {
	const hasConfig = await fileExists(
		workspace.resolve('mcp-vertex.config.json'),
	);

	let mcpServerName: string | undefined;
	for (const candidate of MCP_CONFIG_CANDIDATES) {
		const text = await readIfExists(workspace.resolve(candidate));
		if (text === undefined) continue;
		mcpServerName = findMcpVertexServerName(text);
		if (mcpServerName !== undefined) break;
	}

	return {
		existingMcpVertex: hasConfig || mcpServerName !== undefined,
		...(mcpServerName !== undefined ? { mcpServerName } : {}),
	};
};

/**
 * Resolves the `existingMcpVertex` / `mcpServerName` pair a `host` or
 * `agent` scaffold call should use: an explicit caller value always wins
 * (never silently override a real choice); an omitted value falls back to
 * `detectExistingMcpVertexInstall`. Kinds other than `host` / `agent`
 * don't consume either field, so this skips the workspace I/O for them.
 */
export const resolveHostScaffoldDefaults = async (
	args: {
		readonly kind: string;
		readonly existingMcpVertex?: boolean | undefined;
		readonly mcpServerName?: string | undefined;
	},
	workspace: IWorkspacePathProvider,
): Promise<IExistingMcpVertexInstall | undefined> => {
	const needsDetection =
		(args.kind === 'host' || args.kind === 'agent') &&
		(args.existingMcpVertex === undefined ||
			args.mcpServerName === undefined);
	const detected = needsDetection
		? await detectExistingMcpVertexInstall(workspace)
		: undefined;
	const mcpServerName = args.mcpServerName ?? detected?.mcpServerName;
	const existingMcpVertex =
		args.existingMcpVertex ?? detected?.existingMcpVertex;
	if (mcpServerName === undefined && existingMcpVertex === undefined) {
		return undefined;
	}
	return {
		existingMcpVertex: existingMcpVertex ?? false,
		...(mcpServerName !== undefined ? { mcpServerName } : {}),
	};
};
