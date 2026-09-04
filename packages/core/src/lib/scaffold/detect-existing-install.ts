/**
 * detect-existing-install.ts — x00201 S2.
 *
 * `IScaffoldHostOptions.existingDelendai` / `mcpServerName` (x00200 S2,
 * x00201 S1) are correct once known, but nothing ever told the caller to
 * pass them: a fresh LLM adopting delendai into a project that already
 * has a working (or partial, or stale) install has no way to know it
 * should set `existingDelendai: true`, let alone what the project's real
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
import type { IExistingDelendaiInstall } from '../contracts/interfaces/existing-delendai-install.interface';

export type { IExistingDelendaiInstall } from '../contracts/interfaces/existing-delendai-install.interface';

interface IMcpServerLaunchShape {
	readonly command?: unknown;
	readonly args?: unknown;
}

/** Substrings that identify an delendai launch command, wherever they appear in `command` or `args`. */
const DELENDAI_LAUNCH_SIGNATURES: readonly string[] = [
	'@delendai/cli',
	'delendai',
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

/** True when a server entry's command/args shape matches a known delendai launch. */
export const isDelendaiLaunchShape = (entry: IMcpServerLaunchShape): boolean =>
	asArgv(entry).some((token) =>
		DELENDAI_LAUNCH_SIGNATURES.some((sig) => token.includes(sig)),
	);

/**
 * Parses the raw text of an editor MCP config file (`.vscode/mcp.json`'s
 * `{ servers: {...} }` shape, or `.mcp.json`'s `{ mcpServers: {...} }`
 * shape — both exist in the wild; delendai's own repo uses the second)
 * and returns the key of the first server entry whose launch shape
 * matches delendai. Returns `undefined` on unparsable JSON or no match,
 * never throws — a malformed config is the target project's problem, not
 * a reason to crash detection.
 */
export const findDelendaiServerName = (
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
		if (isDelendaiLaunchShape(entry as IMcpServerLaunchShape)) return name;
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

/** Editor config files checked, in priority order — the first delendai-shaped match wins. */
const MCP_CONFIG_CANDIDATES: readonly string[] = [
	'.vscode/mcp.json',
	'.mcp.json',
];

/**
 * Detects whether `workspace` already has an delendai install (config,
 * a registered server, or both) and — when discoverable — the server's
 * real registration key. Never throws: a workspace with no prior install
 * (the common greenfield case) resolves to
 * `{ existingDelendai: false }`, same as passing no option today.
 */
export const detectExistingDelendaiInstall = async (
	workspace: IWorkspacePathProvider,
): Promise<IExistingDelendaiInstall> => {
	const hasConfig = await fileExists(
		workspace.resolve('delendai.config.json'),
	);

	let mcpServerName: string | undefined;
	for (const candidate of MCP_CONFIG_CANDIDATES) {
		const text = await readIfExists(workspace.resolve(candidate));
		if (text === undefined) continue;
		mcpServerName = findDelendaiServerName(text);
		if (mcpServerName !== undefined) break;
	}

	return {
		existingDelendai: hasConfig || mcpServerName !== undefined,
		...(mcpServerName !== undefined ? { mcpServerName } : {}),
	};
};

/**
 * Resolves the `existingDelendai` / `mcpServerName` pair a `host` or
 * `agent` scaffold call should use: an explicit caller value always wins
 * (never silently override a real choice); an omitted value falls back to
 * `detectExistingDelendaiInstall`. Kinds other than `host` / `agent`
 * don't consume either field, so this skips the workspace I/O for them.
 */
export const resolveHostScaffoldDefaults = async (
	args: {
		readonly kind: string;
		readonly existingDelendai?: boolean | undefined;
		readonly mcpServerName?: string | undefined;
	},
	workspace: IWorkspacePathProvider,
): Promise<IExistingDelendaiInstall | undefined> => {
	const needsDetection =
		(args.kind === 'host' || args.kind === 'agent') &&
		(args.existingDelendai === undefined ||
			args.mcpServerName === undefined);
	const detected = needsDetection
		? await detectExistingDelendaiInstall(workspace)
		: undefined;
	const mcpServerName = args.mcpServerName ?? detected?.mcpServerName;
	const existingDelendai =
		args.existingDelendai ?? detected?.existingDelendai;
	if (mcpServerName === undefined && existingDelendai === undefined) {
		return undefined;
	}
	return {
		existingDelendai: existingDelendai ?? false,
		...(mcpServerName !== undefined ? { mcpServerName } : {}),
	};
};
