/**
 * `tools/scripts/dev/api/setup-status.ts` — server-side workspace
 * detection. Reports whether the current workspace looks like a
 * project that *uses* mcp-vertex (so the dev preview can render the
 * full dashboard) or one that *doesn't* (so it can show the setup
 * wizard).
 *
 * The detection ladder (most-specific → least-specific):
 *   1. `.vscode/mcp.json` declares the `mcp-vertex` stdio server.
 *   2. `.vscode/settings.json` configures `mcp-vertex.server.command`.
 *   3. `mcp-vertex.config.json` is present at the workspace root.
 *   4. `.proposals/` directory exists (active workflow).
 *
 * We do NOT spawn the MCP server here — that's `real-data.ts`'s job
 * and it's expensive (several seconds cold). Setup status is a cheap
 * file scan that runs on every page load.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type WorkspaceKind = 'configured' | 'partial' | 'unconfigured';

export interface ISetupSignal {
	readonly id:
		| 'mcp-json'
		| 'settings-server'
		| 'mcp-vertex-config'
		| 'proposals-dir'
		| 'package-script';
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

const safeStat = (path: string): boolean => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

const safeExists = (path: string): boolean => {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
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
	const configPath = join(cwd, 'mcp-vertex.config.json');
	const proposalsPath = join(cwd, '.proposals');

	const signals: readonly ISetupSignal[] = [
		signal(
			'mcp-json',
			mcpJsonPath,
			'.vscode/mcp.json declares the stdio server',
		),
		signal(
			'settings-server',
			settingsPath,
			'mcp-vertex.server.command set in .vscode/settings.json',
		),
		signal(
			'mcp-vertex-config',
			configPath,
			'mcp-vertex.config.json declares the plugin surface',
		),
		signal(
			'proposals-dir',
			proposalsPath,
			'.proposals/ directory exists (workflow active)',
		),
	];

	const hits = signals.filter((s) => s.present).length;
	const proposals = safeStat(proposalsPath);
	const kind: WorkspaceKind =
		hits >= 2 || (hits >= 1 && proposals)
			? 'configured'
			: hits >= 1
				? 'partial'
				: 'unconfigured';

	const nextStep: ISetupStatus['nextStep'] =
		kind === 'configured'
			? 'spawn-mcp'
			: kind === 'partial'
				? 'install'
				: 'manual';

	const suggestion =
		kind === 'configured'
			? 'Workspace looks ready. The dev preview will try to spawn the MCP server on the first refresh.'
			: kind === 'partial'
				? 'Some mcp-vertex files are present but the configuration is incomplete. Run "mcp-vertex: Set up GitHub issues" or click Install below to wire everything up.'
				: 'This workspace does not look like it uses mcp-vertex yet. Click Install to drop a minimal .vscode/mcp.json + .vscode/settings.json pair so the preview can talk to a fresh MCP server.';

	return { kind, signals, nextStep, suggestion };
};
