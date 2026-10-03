/**
 * `tools/scripts/dev/api/setup-status.ts` — server-side workspace
 * detection. Reports whether the current workspace looks like a
 * project that *uses* delendai (so the dev preview can render the
 * full dashboard) or one that *doesn't* (so it can show the setup
 * wizard).
 *
 * The detection ladder (most-specific → least-specific):
 *   1. `.vscode/mcp.json` declares the `delendai` stdio server.
 *   2. `.vscode/settings.json` configures `delendai.server.command`.
 *   3. `delendai.config.json` is present at the workspace root.
 *
 * Strict semantics: a workspace is **`configured`** only when the two
 * `.vscode/*` files BOTH declare the delendai server. Anything
 * less is `partial` — and the wizard should walk you through the
 * missing pieces. We do NOT count `.proposals/` as a signal because
 * that directory is workflow-agnostic (any repo can use a
 * `pNNN-*.md` convention without delendai).
 *
 * We do NOT spawn the MCP server here — that's `real-data.ts`'s job
 * and it is expensive (several seconds cold). Setup status is a cheap
 * file scan that runs on every page load.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type WorkspaceKind = 'configured' | 'partial' | 'unconfigured';

export interface ISetupSignal {
	readonly id: 'mcp-json' | 'settings-server' | 'delendai-config';
	readonly present: boolean;
	readonly path: string;
	readonly detail?: string;
}

export interface ISetupStatus {
	readonly kind: WorkspaceKind;
	readonly signals: readonly ISetupSignal[];
	readonly nextStep: 'spawn-mcp' | 'install' | 'manual';
	readonly suggestion: string;
}

const safeExists = (path: string): boolean => {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
};

const hasJsoncKey = (path: string, dotted: string): boolean => {
	if (!safeExists(path)) return false;
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return false;
	}
	// Strip js-style line comments and trailing commas, then parse.
	// VS Code's `settings.json` is JSON-with-comments; plain
	// JSON.parse would choke on `// foo` lines.
	const cleaned = raw
		.replace(/^\uFEFF/, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')
		.replace(/,(\s*[}\]])/g, '$1');
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return false;
	}
	if (parsed === null || typeof parsed !== 'object') return false;
	const root = parsed as Record<string, unknown>;
	// VS Code's settings.json treats dotted keys as **flat** entries
	// (e.g. `"delendai.server": { ... }` is a single top-level
	// key, not a nested `{ delendai: { server: ... } }` object).
	// mcp.json is the opposite — it uses true nested objects
	// (e.g. `servers.delendai`). The lookup therefore tries the
	// flat key first (covers settings.json), then walks the dotted
	// path (covers mcp.json + any other nested JSONC).
	if (root[dotted] !== undefined) return true;
	const parts = dotted.split('.');
	let cursor: unknown = root;
	for (const p of parts) {
		if (cursor === null || typeof cursor !== 'object') return false;
		cursor = (cursor as Record<string, unknown>)[p];
	}
	return cursor !== undefined;
};

const signal = (
	id: ISetupSignal['id'],
	path: string,
	detail?: string,
): ISetupSignal => {
	const base = {
		id,
		path,
		present: safeExists(path),
	} satisfies Omit<ISetupSignal, 'detail'>;
	return detail === undefined ? base : { ...base, detail };
};

export const detectSetupStatus = (cwd: string): ISetupStatus => {
	const mcpJsonPath = join(cwd, '.vscode', 'mcp.json');
	const settingsPath = join(cwd, '.vscode', 'settings.json');
	const configPath = join(cwd, 'delendai.config.json');

	const signals: readonly ISetupSignal[] = [
		signal(
			'mcp-json',
			mcpJsonPath,
			'.vscode/mcp.json declares the stdio server',
		),
		signal(
			'settings-server',
			settingsPath,
			'delendai.server.command set in .vscode/settings.json',
		),
		signal(
			'delendai-config',
			configPath,
			'delendai.config.json declares the plugin surface',
		),
	];

	// Configure detection goes a step deeper than raw existence: the
	// file must actually DECLARE the relevant section. A workspace can
	// have an empty `mcp.json`; that's not "configured".
	const mcpDeclares =
		hasJsoncKey(mcpJsonPath, 'servers.delendai') ||
		hasJsoncKey(mcpJsonPath, 'servers."delendai"');
	const settingsDeclares = hasJsoncKey(settingsPath, 'delendai.server');
	const configDeclares = safeExists(configPath);

	const bothVscodeOk = mcpDeclares && settingsDeclares;
	const anyVscodeOk = mcpDeclares || settingsDeclares;
	const configOk = configDeclares;

	const kind: WorkspaceKind = bothVscodeOk
		? 'configured'
		: anyVscodeOk || configOk
			? 'partial'
			: 'unconfigured';

	const nextStep: ISetupStatus['nextStep'] =
		kind === 'configured'
			? 'spawn-mcp'
			: kind === 'partial'
				? 'install'
				: 'manual';

	const missing: string[] = [];
	if (!mcpDeclares) missing.push('.vscode/mcp.json');
	if (!settingsDeclares)
		missing.push('.vscode/settings.json (delendai.server)');

	const suggestion =
		kind === 'configured'
			? 'Workspace looks ready. The dev preview will spawn the MCP server on the first refresh.'
			: kind === 'partial'
				? `Partially wired: missing ${missing.join(' / ')}. Click Install to drop the missing piece (idempotent — existing content is preserved).`
				: "This workspace doesn't use delendai yet. Click Install to drop a minimal .vscode/mcp.json + .vscode/settings.json (and a starter delendai.config.json if you want a preset plugin surface).";

	return { kind, signals, nextStep, suggestion };
};
