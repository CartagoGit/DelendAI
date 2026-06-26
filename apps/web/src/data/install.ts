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
	/** The one-command universal installer (`… init`). */
	readonly init: string;
	/** One-line verify-it-runs hint. */
	readonly run: string;
	readonly note?: string;
	/**
	 * i18n key (under `t.install.dummies`) for the beginner-friendly
	 * "what it does and why" explanation rendered in this packager's panel.
	 * Single source of truth: the data model declares which copy key to
	 * render; the locale files own the actual translated prose.
	 */
	readonly dummiesKey: PackagerDummiesKey;
}

/**
 * Every beginner-explanation copy key a packager panel can render. Kept as a
 * string union so the data model and the `IInstallDummies` i18n shape stay in
 * lock-step: add a packager → add a key here → TypeScript forces every locale
 * to provide the translation (and the i18n gate confirms it at build time).
 */
export type PackagerDummiesKey =
	| 'npm'
	| 'pnpm'
	| 'yarn'
	| 'bun'
	| 'deno'
	| 'pip'
	| 'pipx'
	| 'uv'
	| 'poetry'
	| 'composer'
	| 'artisan';

export const packageManagers: readonly IPackageManager[] = [
	{
		id: 'npm',
		label: 'npm',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `npx -y ${PACKAGE} init`,
		run: `npx -y ${PACKAGE} --check`,
		dummiesKey: 'npm',
	},
	{
		id: 'pnpm',
		label: 'pnpm',
		command: 'pnpm',
		args: ['dlx', PACKAGE],
		init: `pnpm dlx ${PACKAGE} init`,
		run: `pnpm dlx ${PACKAGE} --check`,
		dummiesKey: 'pnpm',
	},
	{
		id: 'yarn',
		label: 'yarn',
		command: 'yarn',
		args: ['dlx', PACKAGE],
		init: `yarn dlx ${PACKAGE} init`,
		run: `yarn dlx ${PACKAGE} --check`,
		dummiesKey: 'yarn',
	},
	{
		id: 'bun',
		label: 'bun',
		command: 'bunx',
		args: [PACKAGE],
		init: `bunx ${PACKAGE} init`,
		run: `bunx ${PACKAGE} --check`,
		note: 'mcp-vertex itself is built with bun.',
		dummiesKey: 'bun',
	},
	{
		id: 'deno',
		label: 'deno',
		command: 'deno',
		args: ['run', '-A', `npm:${PACKAGE}`],
		init: `deno run -A npm:${PACKAGE} init`,
		run: `deno run -A npm:${PACKAGE} --check`,
		dummiesKey: 'deno',
	},
];

/**
 * A target ecosystem / runtime a junior installs mcp-vertex into. mcp-vertex
 * ships as a Node package; non-Node ecosystems reach it through their idiomatic
 * "run an npm CLI" bridge (Python via `uv`/`pipx` wrappers around `npx`, PHP via
 * Composer scripts / Artisan), so every packager below ultimately spawns the
 * same stdio MCP server — only the developer's muscle memory differs.
 *
 * f00065 S4 — this groups packagers under an icon+name language selector so a
 * junior can pick the runtime they already know (Node / Python / PHP) and read
 * a beginner-friendly explanation for each packager in that ecosystem.
 */
export interface IEcosystem {
	readonly id: string;
	readonly label: string;
	/** i18n key (under `t.install.ecosystems`) for the one-line tagline. */
	readonly taglineKey: EcosystemKey;
	/** Packagers idiomatic to this ecosystem, in recommended order. */
	readonly packagers: readonly IPackageManager[];
}

/** Ecosystem ids that carry a translated tagline. Mirrors `IInstallEcosystems`. */
export type EcosystemKey = 'node' | 'python' | 'php';

/**
 * Python packagers. mcp-vertex is not published to PyPI; Python developers run
 * it through the Node toolchain their environment already has, or through `uv`,
 * which can execute an npm package without a global Node install. The commands
 * stay honest: they all end up running the same `@mcp-vertex/core` stdio server.
 */
const pythonPackagers: readonly IPackageManager[] = [
	{
		id: 'pip',
		label: 'pip',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `npx -y ${PACKAGE} init`,
		run: `npx -y ${PACKAGE} --check`,
		note: 'mcp-vertex is a Node CLI; pip users typically already have Node + npx available.',
		dummiesKey: 'pip',
	},
	{
		id: 'pipx',
		label: 'pipx',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `pipx run --spec nodejs-bin npx -y ${PACKAGE} init`,
		run: `pipx run --spec nodejs-bin npx -y ${PACKAGE} --check`,
		note: 'pipx runs CLI tools in throwaway environments; here it provisions Node, then npx fetches mcp-vertex.',
		dummiesKey: 'pipx',
	},
	{
		id: 'uv',
		label: 'uv',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `uvx --from nodejs-bin npx -y ${PACKAGE} init`,
		run: `uvx --from nodejs-bin npx -y ${PACKAGE} --check`,
		note: 'uv (uvx) is the fast modern Python runner; it can pull a Node shim and run mcp-vertex with no global install.',
		dummiesKey: 'uv',
	},
	{
		id: 'poetry',
		label: 'poetry',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `poetry run npx -y ${PACKAGE} init`,
		run: `poetry run npx -y ${PACKAGE} --check`,
		note: 'Inside a Poetry project, `poetry run` executes the command in the managed virtualenv (Node must be on PATH).',
		dummiesKey: 'poetry',
	},
];

/**
 * PHP packagers. Composer is PHP's package manager; Artisan is the Laravel
 * project's command runner. Neither installs mcp-vertex itself — both wrap the
 * same Node CLI so a Laravel/PHP team can register the MCP server from the
 * tooling they already script their projects with.
 */
const phpPackagers: readonly IPackageManager[] = [
	{
		id: 'composer',
		label: 'composer',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `composer exec -- npx -y ${PACKAGE} init`,
		run: `composer exec -- npx -y ${PACKAGE} --check`,
		note: 'Composer is PHP’s dependency manager; `composer exec` runs a project-local binary (here, npx) so the command works the same on every teammate’s machine.',
		dummiesKey: 'composer',
	},
	{
		id: 'artisan',
		label: 'artisan',
		command: 'npx',
		args: ['-y', PACKAGE],
		init: `php artisan mcp:vertex-init`,
		run: `php artisan mcp:vertex-check`,
		note: 'Artisan is Laravel’s command-line runner; wrap the npx call in a small Artisan command so it joins your existing `php artisan` workflow.',
		dummiesKey: 'artisan',
	},
];

/**
 * Single source of truth for the icon+name language selector. Order = tab order.
 * Node first (mcp-vertex’s native runtime), then Python and PHP.
 */
export const ecosystems: readonly IEcosystem[] = [
	{
		id: 'node',
		label: 'Node',
		taglineKey: 'node',
		packagers: packageManagers,
	},
	{
		id: 'python',
		label: 'Python',
		taglineKey: 'python',
		packagers: pythonPackagers,
	},
	{
		id: 'php',
		label: 'PHP',
		taglineKey: 'php',
		packagers: phpPackagers,
	},
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
	{
		id: 'vscode',
		label: 'VS Code · Copilot',
		file: '.vscode/mcp.json',
		scope: 'project',
		kind: 'servers',
		stdioType: true,
	},
	{
		id: 'cursor',
		label: 'Cursor',
		file: '.cursor/mcp.json  ·  ~/.cursor/mcp.json',
		scope: 'project / global',
		kind: 'mcpServers',
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		file: '~/.codeium/windsurf/mcp_config.json',
		scope: 'global',
		kind: 'mcpServers',
	},
	{
		id: 'claude-code',
		label: 'Claude Code',
		file: '.mcp.json  ·  claude mcp add',
		scope: 'project',
		kind: 'mcpServers',
	},
	{
		id: 'claude-desktop',
		label: 'Claude Desktop',
		file: 'claude_desktop_config.json',
		scope: 'global',
		kind: 'mcpServers',
	},
	{
		id: 'antigravity',
		label: 'Antigravity',
		file: '~/.gemini/antigravity-ide/mcp_config.json',
		scope: 'global',
		kind: 'mcpServers',
	},
	{
		id: 'zed',
		label: 'Zed',
		file: 'settings.json',
		scope: 'global',
		kind: 'context_servers',
	},
];

/** Build the MCP config JSON snippet for one IDE + package manager. */
export const renderConfig = (
	ide: IIdeTarget,
	pm: IPackageManager,
	preset = 'standard',
): string => {
	const args = [...pm.args, `--preset=${preset}`];
	const server: Record<string, unknown> = { command: pm.command, args };
	if (ide.stdioType)
		Object.assign(server, { type: 'stdio', command: pm.command, args });
	const inner =
		ide.kind === 'context_servers'
			? { [SERVER_NAME]: { command: pm.command, args } }
			: {
					[SERVER_NAME]: ide.stdioType
						? { type: 'stdio', command: pm.command, args }
						: { command: pm.command, args },
				};
	return JSON.stringify({ [ide.kind]: inner }, null, 2);
};
